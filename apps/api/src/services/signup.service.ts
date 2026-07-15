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

  const existingParentEmails = existingUsers
    .map((user) => user.email)
    .filter((email): email is string => Boolean(email))
    .filter((email) => normalizedParentEmails.includes(email));
  const playerUsernameAlreadyExists = existingUsers.some((user) => user.username === playerUsername);

  if (existingParentEmails.length > 0) {
    throw new AppError("Jedna od e-adresa roditelja već je registrirana.", 409, {
      emails: existingParentEmails,
    });
  }

  if (existingPlayer) {
    throw new AppError("Igrač s ovim OIB-om već postoji.", 409);
  }

  if (playerUsernameAlreadyExists) {
    throw new AppError("Račun igrača za ovu prijavu već postoji.", 409);
  }

  const primaryPassword = generateTemporaryPassword();
  const secondaryPassword = signup.parentTwoEmail ? generateTemporaryPassword() : null;
  const playerPassword = generateTemporaryPassword();

  const [primaryPasswordHash, secondaryPasswordHash, playerPasswordHash] = await Promise.all([
    hashPassword(primaryPassword),
    secondaryPassword ? hashPassword(secondaryPassword) : Promise.resolve(null),
    hashPassword(playerPassword),
  ]);

  const result = await prisma.$transaction(async (transaction) => {
    const primaryParent = await transaction.parent.create({
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

    const secondaryParent =
      signup.parentTwoEmail && secondaryPasswordHash
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

  const emailResults = await Promise.all([
    emailService.sendCredentialsEmail({
      to: result.primaryParent.user.email ?? signup.parentOneEmail,
      firstName: result.primaryParent.user.firstName,
      clubName,
      login: result.primaryParent.user.email ?? signup.parentOneEmail,
      password: primaryPassword,
      additionalCredentials: [
        {
          label: `Račun igrača ${signup.childFirstName} ${signup.childLastName}`,
          login: playerUsername,
          password: playerPassword,
        },
      ],
    }),
    result.secondaryParent && secondaryPassword
      ? emailService.sendCredentialsEmail({
          to: result.secondaryParent.user.email ?? signup.parentTwoEmail ?? "",
          firstName: result.secondaryParent.user.firstName,
          clubName,
          login: result.secondaryParent.user.email ?? signup.parentTwoEmail ?? "",
          password: secondaryPassword,
          additionalCredentials: [
            {
              label: `Račun igrača ${signup.childFirstName} ${signup.childLastName}`,
              login: playerUsername,
              password: playerPassword,
            },
          ],
        })
      : Promise.resolve(false),
  ]);

  return {
    ...result,
    emailsSent: {
      primaryParent: emailResults[0],
      secondaryParent: emailResults[1] ?? false,
    },
    developmentCredentials:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            primaryParent: {
              email: signup.parentOneEmail,
              password: primaryPassword,
            },
            secondaryParent:
              signup.parentTwoEmail && secondaryPassword
                ? {
                    email: signup.parentTwoEmail,
                    password: secondaryPassword,
                  }
                : null,
            player: {
              username: playerUsername,
              password: playerPassword,
            },
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
