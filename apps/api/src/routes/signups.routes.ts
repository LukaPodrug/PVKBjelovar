import { CategoryKind, ProgramAudience, SignupStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadSignupImages } from "../middlewares/upload";
import { suggestCategoryIdForDateOfBirth } from "../services/category.service";
import {
  getClubMembershipPricing,
  getSiblingPriceCents,
  resolveMembershipPrice,
} from "../services/membership-price.service";
import { buildMembershipPayment } from "../services/public-program.service";
import {
  approveSignupRequest,
  declineSignupRequest,
  reopenSignupRequest,
} from "../services/signup.service";
import {
  normalizeEmail,
  optionalString,
  buildPaginatedResponse,
  parseBooleanInput,
  parseDateInput,
  parseOptionalEuroAmountInput,
  parseOptionalSwimmingAbilityInput,
  parsePaginationInput,
  requireSwimmingAbilityInput,
  requireString,
} from "../utils/request-parsers";
import {
  buildPersonImageTitle,
  getUploadedFileMap,
  resolveUploadedImageUrl,
} from "../utils/upload-helpers";

const signupInclude = {
  suggestedCategory: true,
  assignedCategory: true,
  reviewedBy: true,
  approvedPrimaryParent: {
    include: {
      user: true,
    },
  },
  approvedSecondaryParent: {
    include: {
      user: true,
    },
  },
  approvedPlayer: {
    include: {
      user: true,
    },
  },
} as const;

export const signupsRouter = Router();

/**
 * Parses the parent and child fields shared by the public signup form and the admin edit of a
 * pending or declined signup. Images and GDPR consent are handled by the callers.
 */
function parseSignupDetails(body: Record<string, unknown>) {
  const hasSecondParent = Boolean(
    body.parentTwoFirstName || body.parentTwoLastName || body.parentTwoEmail || body.parentTwoPhone,
  );
  const parentOneEmail = normalizeEmail(body.parentOneEmail, "parentOneEmail");
  const parentTwoEmail = hasSecondParent ? normalizeEmail(body.parentTwoEmail, "parentTwoEmail") : null;

  if (parentTwoEmail && parentTwoEmail === parentOneEmail) {
    throw new AppError("Roditelji moraju imati različite e-adrese.", 400);
  }

  return {
    parentOneFirstName: requireString(body.parentOneFirstName, "parentOneFirstName"),
    parentOneLastName: requireString(body.parentOneLastName, "parentOneLastName"),
    parentOneEmail,
    parentOnePhone: requireString(body.parentOnePhone, "parentOnePhone"),
    parentTwoFirstName: hasSecondParent ? requireString(body.parentTwoFirstName, "parentTwoFirstName") : null,
    parentTwoLastName: hasSecondParent ? requireString(body.parentTwoLastName, "parentTwoLastName") : null,
    parentTwoEmail,
    parentTwoPhone: hasSecondParent ? requireString(body.parentTwoPhone, "parentTwoPhone") : null,
    childFirstName: requireString(body.childFirstName, "childFirstName"),
    childLastName: requireString(body.childLastName, "childLastName"),
    childDateOfBirth: parseDateInput(body.childDateOfBirth, "childDateOfBirth"),
    childOib: requireString(body.childOib, "childOib"),
    childAddress: requireString(body.childAddress, "childAddress"),
  };
}

/**
 * A signup sent from a program's tab names that program, and it becomes the suggestion as-is.
 * Everything else is a waterpolo signup and gets the age-based suggestion.
 */
async function resolveProgram(value: unknown) {
  const programCategoryId = optionalString(value);

  if (!programCategoryId) {
    return null;
  }

  const program = await prisma.category.findFirst({
    // Programs for non-members take practice signups instead and never create accounts.
    where: { id: programCategoryId, kind: CategoryKind.PROGRAM, audience: ProgramAudience.MEMBERS },
    select: {
      id: true,
      kind: true,
      audience: true,
      monthlyPriceCents: true,
      siblingPriceCents: true,
      membershipFreeUntil: true,
    },
  });

  if (!program) {
    throw new AppError("Odabrani program nije pronađen.", 404);
  }

  return program;
}

/**
 * The club wants program families to be able to pay the first month straight away, even though the
 * signup still waits for approval. A family that already has a kid in the club pays the program's
 * sibling fee; during a free period there is nothing to pay.
 */
async function buildFirstMembershipPayment(
  program: NonNullable<Awaited<ReturnType<typeof resolveProgram>>>,
  details: ReturnType<typeof parseSignupDetails>,
) {
  const [clubPricing, bank, [withSiblings]] = await Promise.all([
    getClubMembershipPricing(),
    prisma.clubSettings.findUnique({ where: { id: "club-settings" } }),
    withSiblingsInClub([details]),
  ]);
  const siblingPriceCents =
    withSiblings!.siblingsInClub.length > 0 ? getSiblingPriceCents(program, clubPricing) : null;
  const price = resolveMembershipPrice(
    { membershipPriceCents: siblingPriceCents, categories: [{ category: program }] },
    clubPricing,
  );

  if (price.freeUntil || !price.priceCents) {
    return { payment: null, membershipFreeUntil: price.freeUntil, siblingPriceApplied: false };
  }

  return {
    siblingPriceApplied: siblingPriceCents !== null,
    payment: buildMembershipPayment(
      {
        amountCents: price.priceCents,
        month: new Date(),
        childFirstName: details.childFirstName,
        childLastName: details.childLastName,
        parentFirstName: details.parentOneFirstName,
        parentLastName: details.parentOneLastName,
      },
      {
        bankRecipient: bank?.bankRecipient ?? null,
        bankIban: bank?.bankIban ?? null,
        bankName: bank?.bankName ?? null,
        bankRecipientAddress: bank?.bankRecipientAddress ?? null,
        bankRecipientCity: bank?.bankRecipientCity ?? null,
      },
    ),
    membershipFreeUntil: null,
  };
}

signupsRouter.post(
  "/",
  uploadSignupImages,
  asyncHandler(async (request, response) => {
    const files = getUploadedFileMap(request.files);

    const details = parseSignupDetails(request.body);
    const program = await resolveProgram(request.body.programCategoryId);
    const suggestedCategoryId =
      program?.id ?? (await suggestCategoryIdForDateOfBirth(details.childDateOfBirth));

    const signupRequest = await prisma.signupRequest.create({
      data: {
        ...details,
        // Only program signups ask about swimming; waterpolo kids already swim.
        childSwimmingAbility: program
          ? requireSwimmingAbilityInput(request.body.childSwimmingAbility)
          : null,
        parentOneProfileImageUrl: await resolveUploadedImageUrl(
          files.parentOneProfileImage?.[0],
          buildPersonImageTitle(details.parentOneFirstName, details.parentOneLastName),
          request.body.parentOneProfileImageUrl,
        ),
        parentTwoProfileImageUrl: details.parentTwoFirstName
          ? await resolveUploadedImageUrl(
              files.parentTwoProfileImage?.[0],
              buildPersonImageTitle(details.parentTwoFirstName, details.parentTwoLastName!),
              request.body.parentTwoProfileImageUrl,
            )
          : null,
        childProfileImageUrl: await resolveUploadedImageUrl(
          files.childProfileImage?.[0],
          buildPersonImageTitle(details.childFirstName, details.childLastName),
          request.body.childProfileImageUrl,
        ),
        gdprConsent: parseBooleanInput(request.body.gdprConsent, "gdprConsent"),
        suggestedCategoryId,
      },
      include: signupInclude,
    });

    response.status(201).json({
      message: "Prijava je uspješno zaprimljena.",
      signupRequest,
      ...(program ? await buildFirstMembershipPayment(program, details) : {}),
    });
  }),
);

signupsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

interface FamilySibling {
  playerId: string | null;
  signupId: string | null;
  firstName: string;
  lastName: string;
  /** True for a child whose own signup is still waiting for approval. */
  isPendingSignup: boolean;
}

/**
 * Other children of the same family, matched by parent e-mail: kids already in the club and kids
 * whose signup is still pending (a parent may sign up several children before any is approved).
 * `siblingsInClub` are the ones that make this child a second or further kid, so the sibling fee
 * applies: players plus pending signups sent earlier. `laterFamilySignups` are pending signups sent
 * after this one, shown to admin for context only; they get the sibling fee themselves.
 */
async function withSiblingsInClub<
  T extends {
    id?: string;
    createdAt?: Date;
    parentOneEmail: string;
    parentTwoEmail: string | null;
    childOib: string;
  },
>(signups: T[]) {
  const emails = [
    ...new Set(
      signups.flatMap((signup) =>
        [signup.parentOneEmail, signup.parentTwoEmail]
          .filter((email): email is string => Boolean(email))
          .map((email) => email.toLowerCase()),
      ),
    ),
  ];
  const [parents, pendingSignups] = emails.length
    ? await Promise.all([
        prisma.user.findMany({
          where: { email: { in: emails }, parent: { isNot: null } },
          select: {
            email: true,
            parent: {
              select: {
                players: {
                  select: {
                    player: {
                      select: {
                        id: true,
                        oib: true,
                        user: { select: { firstName: true, lastName: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.signupRequest.findMany({
          where: {
            status: SignupStatus.PENDING,
            OR: [
              { parentOneEmail: { in: emails, mode: "insensitive" } },
              { parentTwoEmail: { in: emails, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            createdAt: true,
            parentOneEmail: true,
            parentTwoEmail: true,
            childOib: true,
            childFirstName: true,
            childLastName: true,
          },
        }),
      ])
    : [[], []];
  const childrenByEmail = new Map(
    parents.map((user) => [user.email!.toLowerCase(), user.parent?.players.map((link) => link.player) ?? []]),
  );

  return signups.map((signup) => {
    const familyEmails = [signup.parentOneEmail, signup.parentTwoEmail]
      .filter((email): email is string => Boolean(email))
      .map((email) => email.toLowerCase());
    const siblings = new Map<string, FamilySibling>();
    const laterSignups = new Map<string, FamilySibling>();
    // Children already counted by OIB, so a kid with both a player and a pending signup shows once.
    const seenOibs = new Set([signup.childOib]);

    for (const email of familyEmails) {
      for (const player of childrenByEmail.get(email) ?? []) {
        // The child being signed up may already be a player (e.g. moving from a program).
        if (!seenOibs.has(player.oib)) {
          seenOibs.add(player.oib);
          siblings.set(player.id, {
            playerId: player.id,
            signupId: null,
            firstName: player.user.firstName,
            lastName: player.user.lastName,
            isPendingSignup: false,
          });
        }
      }
    }

    for (const pending of pendingSignups) {
      const sharesParent = [pending.parentOneEmail, pending.parentTwoEmail].some(
        (email) => email && familyEmails.includes(email.toLowerCase()),
      );

      if (!sharesParent || pending.id === signup.id || seenOibs.has(pending.childOib)) {
        continue;
      }

      seenOibs.add(pending.childOib);
      const entry: FamilySibling = {
        playerId: null,
        signupId: pending.id,
        firstName: pending.childFirstName,
        lastName: pending.childLastName,
        isPendingSignup: true,
      };
      // A signup not saved yet (the public form) is the newest, so every pending one came first.
      const isEarlier = !signup.createdAt || pending.createdAt < signup.createdAt;
      (isEarlier ? siblings : laterSignups).set(pending.id, entry);
    }

    return {
      ...signup,
      siblingsInClub: [...siblings.values()],
      laterFamilySignups: [...laterSignups.values()],
    };
  });
}

signupsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const status =
      typeof request.query.status === "string"
        ? request.query.status.toUpperCase()
        : undefined;

    if (status && !Object.values(SignupStatus).includes(status as SignupStatus)) {
      throw new AppError("Neispravan filtar statusa prijave.", 400);
    }

    const where = {
      status: status as SignupStatus | undefined,
    };
    const pagination = parsePaginationInput(request.query);
    const [signups, total] = await Promise.all([
      prisma.signupRequest.findMany({
        where,
        include: signupInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.signupRequest.count({ where }),
    ]);

    response.json(buildPaginatedResponse(await withSiblingsInClub(signups), total, pagination));
  }),
);

signupsRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const signup = await prisma.signupRequest.findUnique({
      where: { id: signupRequestId },
      include: signupInclude,
    });

    if (!signup) {
      throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
    }

    const [signupWithSiblings] = await withSiblingsInClub([signup]);
    response.json(signupWithSiblings);
  }),
);

signupsRouter.patch(
  "/:id/approve",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await approveSignupRequest({
      signupRequestId,
      reviewerId: request.auth!.userId,
      assignedCategoryId:
        typeof request.body.assignedCategoryId === "string"
          ? request.body.assignedCategoryId
          : undefined,
      membershipPriceCents:
        request.body.membershipPrice !== undefined
          ? parseOptionalEuroAmountInput(request.body.membershipPrice, "membershipPrice")
          : undefined,
    });

    response.json(result);
  }),
);

signupsRouter.patch(
  "/:id/decline",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await declineSignupRequest({
      signupRequestId,
      reviewerId: request.auth!.userId,
      declineReason:
        typeof request.body.declineReason === "string" ? request.body.declineReason : undefined,
    });

    response.json(result);
  }),
);

signupsRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const signup = await prisma.signupRequest.findUnique({
      where: { id: signupRequestId },
      include: { suggestedCategory: { select: { kind: true } } },
    });

    if (!signup) {
      throw new AppError("Zahtjev za prijavu nije pronađen.", 404);
    }

    if (signup.status === SignupStatus.APPROVED) {
      throw new AppError("Odobrenu prijavu nije moguće uređivati.", 400);
    }

    const details = parseSignupDetails(request.body);
    const updatedSignup = await prisma.signupRequest.update({
      where: { id: signup.id },
      data: {
        ...details,
        childSwimmingAbility:
          request.body.childSwimmingAbility !== undefined
            ? parseOptionalSwimmingAbilityInput(request.body.childSwimmingAbility)
            : undefined,
        // A removed second parent takes their photo with them.
        parentTwoProfileImageUrl: details.parentTwoFirstName ? signup.parentTwoProfileImageUrl : null,
        // A program signup keeps its program; only waterpolo suggestions follow the date of birth.
        suggestedCategoryId:
          signup.suggestedCategory?.kind === CategoryKind.PROGRAM
            ? signup.suggestedCategoryId
            : await suggestCategoryIdForDateOfBirth(details.childDateOfBirth),
      },
      include: signupInclude,
    });

    const [updatedSignupWithSiblings] = await withSiblingsInClub([updatedSignup]);
    response.json(updatedSignupWithSiblings);
  }),
);

signupsRouter.patch(
  "/:id/reopen",
  asyncHandler(async (request, response) => {
    const signupRequestId = requireString(request.params.id, "id");
    const result = await reopenSignupRequest(signupRequestId);

    response.json(result);
  }),
);
