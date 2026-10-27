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
async function resolveProgramCategoryId(value: unknown) {
  const programCategoryId = optionalString(value);

  if (!programCategoryId) {
    return null;
  }

  const program = await prisma.category.findFirst({
    // Programs for non-members take practice signups instead and never create accounts.
    where: { id: programCategoryId, kind: CategoryKind.PROGRAM, audience: ProgramAudience.MEMBERS },
    select: { id: true },
  });

  if (!program) {
    throw new AppError("Odabrani program nije pronađen.", 404);
  }

  return program.id;
}

signupsRouter.post(
  "/",
  uploadSignupImages,
  asyncHandler(async (request, response) => {
    const files = getUploadedFileMap(request.files);

    const details = parseSignupDetails(request.body);
    const programCategoryId = await resolveProgramCategoryId(request.body.programCategoryId);
    const suggestedCategoryId =
      programCategoryId ?? (await suggestCategoryIdForDateOfBirth(details.childDateOfBirth));

    const signupRequest = await prisma.signupRequest.create({
      data: {
        ...details,
        // Only program signups ask about swimming; waterpolo kids already swim.
        childSwimmingAbility: programCategoryId
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
    });
  }),
);

signupsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

/**
 * Kids already in the club whose parent signs up another child, matched by parent e-mail. Admin uses
 * it to give the new kid the sibling fee when approving.
 */
async function withSiblingsInClub<
  T extends { parentOneEmail: string; parentTwoEmail: string | null; childOib: string },
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
  const parents = emails.length
    ? await prisma.user.findMany({
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
      })
    : [];
  const childrenByEmail = new Map(
    parents.map((user) => [user.email!.toLowerCase(), user.parent?.players.map((link) => link.player) ?? []]),
  );

  return signups.map((signup) => {
    const siblings = new Map<string, { playerId: string; firstName: string; lastName: string }>();

    for (const email of [signup.parentOneEmail, signup.parentTwoEmail]) {
      for (const player of email ? childrenByEmail.get(email.toLowerCase()) ?? [] : []) {
        // The child being signed up may already be a player (e.g. moving from a program).
        if (player.oib !== signup.childOib) {
          siblings.set(player.id, {
            playerId: player.id,
            firstName: player.user.firstName,
            lastName: player.user.lastName,
          });
        }
      }
    }

    return { ...signup, siblingsInClub: [...siblings.values()] };
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
