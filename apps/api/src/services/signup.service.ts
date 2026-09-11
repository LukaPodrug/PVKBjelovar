import { AccountStatus, SignupStatus, UserRole } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { emailService } from "./email.service";
import { generateTemporaryPassword, hashPassword } from "./password.service";
import { buildDefaultPlayerUsername } from "./username.service";

interface ApproveSignupInput {
  signupRequestId: string;
  reviewerId: string;
  assignedCategoryId?: string;
}

interface DeclineSignupInput {
  signupRequestId: string;
  reviewerId: string;
  declineReason?: string;
}

export async function approveSignupRequest(input: ApproveSignupInput) {
  const signup = await prisma.signupRequest.findUnique({
    where: { id: input.signupRequestId },
  });

  if (!signup) {
    throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
  }

  if (signup.status !== SignupStatus.PENDING) {
    throw new AppError("Moguće je odobriti samo prijave na čekanju.", 400);
  }

  const parentEmails = [signup.parentOneEmail, signup.parentTwoEmail].filter(
    (value): value is string => Boolean(value),
  );
  const uniqueEmailCount = new Set(parentEmails.map((email) => email.toLowerCase())).size;

  if (uniqueEmailCount !== parentEmails.length) {
    throw new AppError("E-adrese roditelja moraju biti jedinstvene.", 400);
  }

  const assignedCategoryId =
    input.assignedCategoryId ?? signup.assignedCategoryId ?? signup.suggestedCategoryId;

  if (!assignedCategoryId) {
    throw new AppError("Kategorija mora biti dodijeljena prije odobravanja.", 400);
  }

  const normalizedParentEmails = parentEmails.map((email) => email.toLowerCase());
  const playerUsername = buildDefaultPlayerUsername(
    signup.childFirstName,
    signup.childLastName,
    signup.childOib,
  );

  const [existingUsers, existingPlayer, clubSettings] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          {
            email: {
              in: normalizedParentEmails,
            },
          },
          {
            username: playerUsername,
          },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    }),
    prisma.player.findUnique({
      where: {
        oib: signup.childOib,
      },
      select: {
        id: true,
      },
    }),
    prisma.clubSettings.findUnique({
      where: {
        id: "club-settings",
      },
      select: {
        clubName: true,
      },
    }),
  ]);

  const playerUsernameAlreadyExists = existingUsers.some((user) => user.username === playerUsername);

  // A parent may already exist from a sibling's signup, or be a coach/admin whose child joins the
  // club. Either way the account is reused as-is: details from this signup are ignored so an
  // established profile is never overwritten by a newer form submission.
  const existingUserByEmail = new Map(
    existingUsers
      .filter((user) => user.email && normalizedParentEmails.includes(user.email.toLowerCase()))
      .map((user) => [user.email!.toLowerCase(), user] as const),
  );
  const existingPrimaryUser = existingUserByEmail.get(signup.parentOneEmail.toLowerCase()) ?? null;
  const existingSecondaryUser = signup.parentTwoEmail
    ? existingUserByEmail.get(signup.parentTwoEmail.toLowerCase()) ?? null
    : null;

  if (existingPlayer) {
    throw new AppError("Igrač s ovim OIB-om već postoji.", 409);
  }

  if (playerUsernameAlreadyExists) {
    throw new AppError("Račun igrača za ovu prijavu već postoji.", 409);
  }

  const primaryPassword = existingPrimaryUser ? null : generateTemporaryPassword();
  const secondaryPassword =
    signup.parentTwoEmail && !existingSecondaryUser ? generateTemporaryPassword() : null;
  const playerPassword = generateTemporaryPassword();

  const [primaryPasswordHash, secondaryPasswordHash, playerPasswordHash] = await Promise.all([
    primaryPassword ? hashPassword(primaryPassword) : Promise.resolve(null),
    secondaryPassword ? hashPassword(secondaryPassword) : Promise.resolve(null),
    hashPassword(playerPassword),
  ]);

  const result = await prisma.$transaction(async (transaction) => {
    // Gives the existing account a parent profile without touching any of its user fields. A coach
    // or admin keeps their original role and simply gains parent access alongside it; an account
    // that is already a parent is returned untouched.
    const attachParentProfile = (userId: string) =>
      transaction.parent.upsert({
        where: { userId },
        create: { userId },
        update: {},
        include: { user: true },
      });

    const primaryParent = existingPrimaryUser
      ? await attachParentProfile(existingPrimaryUser.id)
      : await transaction.parent.create({
          data: {
            user: {
              create: {
                role: UserRole.PARENT,
                email: signup.parentOneEmail.toLowerCase(),
                passwordHash: primaryPasswordHash,
                firstName: signup.parentOneFirstName,
                lastName: signup.parentOneLastName,
                phone: signup.parentOnePhone,
                profileImageUrl: signup.parentOneProfileImageUrl,
                accountStatus: AccountStatus.ACTIVE,
                mustChangePassword: true,
              },
            },
          },
          include: { user: true },
        });

    const secondaryParent = !signup.parentTwoEmail
      ? null
      : existingSecondaryUser
        ? await attachParentProfile(existingSecondaryUser.id)
        : secondaryPasswordHash
          ? await transaction.parent.create({
              data: {
                user: {
                  create: {
                    role: UserRole.PARENT,
                    email: signup.parentTwoEmail.toLowerCase(),
                    passwordHash: secondaryPasswordHash,
                    firstName: signup.parentTwoFirstName ?? "",
                    lastName: signup.parentTwoLastName ?? "",
                    phone: signup.parentTwoPhone ?? undefined,
                    profileImageUrl: signup.parentTwoProfileImageUrl,
                    accountStatus: AccountStatus.ACTIVE,
                    mustChangePassword: true,
                  },
                },
              },
              include: { user: true },
            })
          : null;

    const player = await transaction.player.create({
      data: {
        dateOfBirth: signup.childDateOfBirth,
        oib: signup.childOib,
        gdprConsent: signup.gdprConsent,
        sourceSignup: {
          connect: {
            id: signup.id,
          },
        },
        user: {
          create: {
            role: UserRole.PLAYER,
            username: playerUsername,
            passwordHash: playerPasswordHash,
            firstName: signup.childFirstName,
            lastName: signup.childLastName,
            profileImageUrl: signup.childProfileImageUrl,
            accountStatus: AccountStatus.ACTIVE,
            mustChangePassword: true,
          },
        },
        categories: {
          create: [
            {
              category: {
                connect: {
                  id: assignedCategoryId,
                },
              },
            },
          ],
        },
        parents: {
          create: [
            {
              parent: {
                connect: {
                  id: primaryParent.id,
                },
              },
              isPrimaryContact: true,
            },
            ...(secondaryParent
              ? [
                  {
                    parent: {
                      connect: {
                        id: secondaryParent.id,
                      },
                    },
                    isPrimaryContact: false,
                  },
                ]
              : []),
          ],
        },
      },
      include: { user: true },
    });

    const updatedSignup = await transaction.signupRequest.update({
      where: {
        id: signup.id,
      },
      data: {
        status: SignupStatus.APPROVED,
        assignedCategoryId,
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        declineReason: null,
        approvedPrimaryParentId: primaryParent.id,
        approvedSecondaryParentId: secondaryParent?.id ?? null,
      },
    });

    return {
      signup: updatedSignup,
      primaryParent,
      secondaryParent,
      player,
    };
  });

  const clubName = clubSettings?.clubName ?? env.defaultClubName;

  const childFullName = `${signup.childFirstName} ${signup.childLastName}`;
  const childCredentials = {
    label: `Račun igrača ${childFullName}`,
    login: playerUsername,
    password: playerPassword,
  };

  // A brand new parent gets their own credentials; one that already had an account keeps their
  // password and is only told that the child was added.
  const notifyParent = (
    parent: { user: { email: string | null; firstName: string } },
    fallbackEmail: string | null,
    password: string | null,
  ) => {
    const to = parent.user.email ?? fallbackEmail;

    if (!to) {
      return Promise.resolve(false);
    }

    if (!password) {
      return emailService.sendChildAddedEmail({
        to,
        firstName: parent.user.firstName,
        clubName,
        childFullName,
        childLogin: playerUsername,
        childPassword: playerPassword,
      });
    }

    return emailService.sendCredentialsEmail({
      to,
      firstName: parent.user.firstName,
      clubName,
      login: to,
      password,
      additionalCredentials: [childCredentials],
    });
  };

  const emailResults = await Promise.all([
    notifyParent(result.primaryParent, signup.parentOneEmail, primaryPassword),
    result.secondaryParent
      ? notifyParent(result.secondaryParent, signup.parentTwoEmail, secondaryPassword)
      : Promise.resolve(false),
  ]);

  return {
    ...result,
    emailsSent: {
      primaryParent: emailResults[0],
      secondaryParent: emailResults[1] ?? false,
    },
  };
}

export async function declineSignupRequest(input: DeclineSignupInput) {
  const signup = await prisma.signupRequest.findUnique({
    where: { id: input.signupRequestId },
  });

  if (!signup) {
    throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
  }

  if (signup.status !== SignupStatus.PENDING) {
    throw new AppError("Moguće je odbiti samo prijave na čekanju.", 400);
  }

  return prisma.signupRequest.update({
    where: {
      id: signup.id,
    },
    data: {
      status: SignupStatus.DECLINED,
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      declineReason: input.declineReason ?? null,
    },
  });
}
