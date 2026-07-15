import { AccountStatus, NotificationType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import {
  buildDevelopmentCredentials,
  resetPlayerCredentials,
  sendPlayerCredentials,
  sendPlayerCredentialsToParents,
} from "../services/credentials.service";
import { notifyPlayerParents } from "../services/notification.service";
import { generateTemporaryPassword, hashPassword } from "../services/password.service";
import { buildDefaultPlayerUsername, parseUsernameInput } from "../services/username.service";
import { formatDateHr } from "../utils/datetime";
import { uploadProfileImage } from "../middlewares/upload";
import {
  optionalString,
  buildPaginatedResponse,
  parseBooleanInput,
  parseDateInput,
  parseOptionalAccountStatusInput,
  parseOptionalBooleanInput,
  parseOptionalDateInput,
  parsePaginationInput,
  parseStringArrayInput,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const playerInclude = {
  user: true,
  categories: {
    include: {
      category: true,
    },
  },
  parents: {
    include: {
      parent: {
        include: {
          user: true,
        },
      },
    },
  },
} as const;

export const playersRouter = Router();

playersRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN, UserRole.COACH));

playersRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const search = optionalString(request.query.search ?? request.query.q);
    const categoryIds = parseStringArrayInput(request.query.categoryIds ?? request.query.categoryId);
    const searchTerms = search?.split(/\s+/).filter(Boolean) ?? [];
    const filters: Prisma.PlayerWhereInput[] = [];

    if (categoryIds.length > 0) {
      filters.push({ categories: { some: { categoryId: { in: categoryIds } } } });
    }

    if (search) {
      const singleTermFilters: Prisma.PlayerWhereInput[] = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
      ];
      const multiTermFilter: Prisma.PlayerWhereInput | null =
        searchTerms.length > 1
          ? {
              AND: searchTerms.map((term) => ({
                OR: [
                  { user: { firstName: { contains: term, mode: "insensitive" } } },
                  { user: { lastName: { contains: term, mode: "insensitive" } } },
                ],
              })),
            }
          : null;

      filters.push({
        OR: multiTermFilter ? [...singleTermFilters, multiTermFilter] : singleTermFilters,
      });
    }

    const where: Prisma.PlayerWhereInput = filters.length > 0 ? { AND: filters } : {};
    const [players, total] = await prisma.$transaction([
      prisma.player.findMany({
        where,
        include: playerInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.player.count({ where }),
    ]);

    response.json(buildPaginatedResponse(players, total, pagination));
  }),
);

playersRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.id, "id");
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: playerInclude,
    });

    if (!player) {
      throw new AppError("Igrač nije pronađen.", 404);
    }

    response.json(player);
  }),
);

playersRouter.post(
  "/",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const categoryIds = parseStringArrayInput(request.body.categoryIds);
    const parentIds = [...new Set(parseStringArrayInput(request.body.parentIds))];
    const primaryParentId = optionalString(request.body.primaryParentId);
    const firstName = requireString(request.body.firstName, "firstName");
    const lastName = requireString(request.body.lastName, "lastName");
    const oib = requireString(request.body.oib, "oib");
    const email = normalizeOptionalEmail(request.body.email);
    const username = request.body.username
      ? parseUsernameInput(request.body.username)
      : buildDefaultPlayerUsername(firstName, lastName, oib);
    const profileImageUrl = await resolveUploadedImageUrl(
      request.file,
      `Player ${request.body.firstName ?? "new"} ${request.body.lastName ?? ""} profile image`,
      request.body.profileImageUrl,
    );

    const existingUser = await prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new AppError("Odabrano korisničko ime igrača je zauzeto.", 409);
    }

    if (email) {
      const existingEmailUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingEmailUser) {
        throw new AppError("Odabrana e-adresa igrača je zauzeta.", 409);
      }
    }

    const canSkipParent = await canPlayerSkipParentWithEmail(email, categoryIds);
    ensurePlayerHasParent(parentIds, primaryParentId, canSkipParent);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const player = await prisma.player.create({
      data: {
        dateOfBirth: parseDateInput(request.body.dateOfBirth, "dateOfBirth"),
        oib,
        gdprConsent: parseBooleanInput(request.body.gdprConsent, "gdprConsent"),
        membershipExpiresAt: parseOptionalDateInput(request.body.membershipExpiresAt),
        user: {
          create: {
            role: UserRole.PLAYER,
            email,
            username,
            passwordHash,
            firstName,
            lastName,
            phone: optionalString(request.body.phone),
            profileImageUrl,
            accountStatus:
              parseOptionalAccountStatusInput(request.body.accountStatus) ?? AccountStatus.ACTIVE,
            mustChangePassword: true,
          },
        },
        categories:
          categoryIds.length > 0
            ? {
                create: categoryIds.map((categoryId) => ({
                  category: {
                    connect: { id: categoryId },
                  },
                })),
              }
            : undefined,
        parents:
          parentIds.length > 0
            ? {
                create: parentIds.map((parentId, index) => ({
                  parent: {
                    connect: { id: parentId },
                  },
                  isPrimaryContact: primaryParentId ? primaryParentId === parentId : index === 0,
                })),
              }
            : undefined,
      },
      include: playerInclude,
    });

    await sendPlayerCredentials(player.id, temporaryPassword);

    response.status(201).json(player);
  }),
);

playersRouter.post(
  "/:id/resend-credentials",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.id, "id");
    const credentialDelivery = await resetPlayerCredentials(playerId);

    response.json({
      message: credentialDelivery.emailSent
        ? "Pristupni podaci igrača su poslani."
        : "Lozinka je resetirana, ali slanje e-pošte nije konfigurirano.",
      emailSent: credentialDelivery.emailSent,
      developmentCredentials: buildDevelopmentCredentials(credentialDelivery),
    });
  }),
);

playersRouter.patch(
  "/:id",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.id, "id");
    const categoryIds = parseStringArrayInput(request.body.categoryIds);
    const parentIds = [...new Set(parseStringArrayInput(request.body.parentIds))];
    const primaryParentId = optionalString(request.body.primaryParentId);
    const existingPlayer = await prisma.player.findUnique({
      where: {
        id: playerId,
      },
      select: {
        id: true,
        userId: true,
        membershipExpiresAt: true,
        _count: {
          select: {
            parents: true,
          },
        },
      },
    });

    if (!existingPlayer) {
      throw new AppError("Igrač nije pronađen.", 404);
    }

    const removeProfileImage = parseOptionalBooleanInput(request.body.removeProfileImage) ?? false;
    const username =
      request.body.username !== undefined ? parseUsernameInput(request.body.username) : undefined;
    const email =
      request.body.email !== undefined ? normalizeOptionalEmail(request.body.email) : undefined;

    if (username) {
      const conflictingUser = await prisma.user.findUnique({
        where: {
          username,
        },
        select: {
          id: true,
        },
      });

      if (conflictingUser && conflictingUser.id !== existingPlayer.userId) {
        throw new AppError("Odabrano korisničko ime igrača je zauzeto.", 409);
      }
    }

    if (email) {
      const conflictingEmailUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (conflictingEmailUser && conflictingEmailUser.id !== existingPlayer.userId) {
        throw new AppError("Odabrana e-adresa igrača je zauzeta.", 409);
      }
    }

    if (request.body.parentIds !== undefined) {
      const canSkipParent = await canPlayerSkipParentWithEmail(
        email ?? null,
        categoryIds,
      );
      ensurePlayerHasParent(parentIds, primaryParentId, canSkipParent);
    } else if (existingPlayer._count.parents === 0) {
      throw new AppError("Igrač mora imati povezanog barem jednog roditelja.", 400);
    }

    const player = await prisma.player.update({
      where: { id: playerId },
      data: {
        dateOfBirth: request.body.dateOfBirth
          ? parseDateInput(request.body.dateOfBirth, "dateOfBirth")
          : undefined,
        oib: request.body.oib ? requireString(request.body.oib, "oib") : undefined,
        gdprConsent:
          request.body.gdprConsent !== undefined
            ? parseBooleanInput(request.body.gdprConsent, "gdprConsent")
            : undefined,
        membershipExpiresAt:
          request.body.membershipExpiresAt !== undefined
            ? parseOptionalDateInput(request.body.membershipExpiresAt)
            : undefined,
        user: {
          update: {
            firstName: request.body.firstName ? requireString(request.body.firstName, "firstName") : undefined,
            lastName: request.body.lastName ? requireString(request.body.lastName, "lastName") : undefined,
            email,
            username,
            phone: request.body.phone !== undefined ? optionalString(request.body.phone) : undefined,
            profileImageUrl:
              removeProfileImage
                ? null
                : request.file || request.body.profileImageUrl
                ? await resolveUploadedImageUrl(
                    request.file,
                    `Player ${playerId} profile image`,
                    request.body.profileImageUrl,
                  )
                : undefined,
            accountStatus: parseOptionalAccountStatusInput(request.body.accountStatus),
          },
        },
        categories:
          categoryIds.length > 0 || request.body.categoryIds
            ? {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({
                  category: {
                    connect: { id: categoryId },
                  },
                })),
              }
            : undefined,
        parents:
          parentIds.length > 0 || request.body.parentIds
            ? {
                deleteMany: {},
                create: parentIds.map((parentId, index) => ({
                  parent: {
                    connect: { id: parentId },
                  },
                  isPrimaryContact: primaryParentId ? primaryParentId === parentId : index === 0,
                })),
              }
            : undefined,
      },
      include: playerInclude,
    });

    response.json(player);

    const previousExpiry = existingPlayer.membershipExpiresAt;
    const nextExpiry = player.membershipExpiresAt;

    if (nextExpiry && (!previousExpiry || nextExpiry.getTime() > previousExpiry.getTime())) {
      void notifyPlayerParents(player.id, {
        type: NotificationType.MEMBERSHIP_RENEWED,
        title: "Članarina obnovljena",
        body: `Članarina za ${player.user.firstName} ${player.user.lastName} vrijedi do ${formatDateHr(
          nextExpiry,
        )}.`,
        data: { playerId: player.id, membershipExpiresAt: nextExpiry.toISOString() },
      });
    }
  }),
);

function ensurePlayerHasParent(
  parentIds: string[],
  primaryParentId: string | null,
  canSkipParent = false,
) {
  if (parentIds.length === 0 && !canSkipParent) {
    throw new AppError("Igrač mora imati povezanog barem jednog roditelja.", 400);
  }

  if (primaryParentId && !parentIds.includes(primaryParentId)) {
    throw new AppError("Primarni roditelj mora biti jedan od povezanih roditelja.", 400);
  }
}

function normalizeOptionalEmail(value: unknown) {
  return optionalString(value)?.toLowerCase() ?? null;
}

async function canPlayerSkipParentWithEmail(email: string | null, categoryIds: string[]) {
  if (!email || categoryIds.length === 0) {
    return false;
  }

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: {
      id: true,
      startDateOfBirth: true,
      endDateOfBirth: true,
    },
  });

  if (categories.length !== categoryIds.length) {
    throw new AppError("Jedna ili više odabranih kategorija nije pronađena.", 404);
  }

  return categories.every(
    (category) => category.endDateOfBirth === null || category.startDateOfBirth !== null,
  );
}

playersRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.id, "id");
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });

    if (!player) {
      response.status(404).json({ message: "Igrač nije pronađen." });
      return;
    }

    await prisma.user.delete({
      where: { id: player.userId },
    });

    response.status(204).send();
  }),
);
