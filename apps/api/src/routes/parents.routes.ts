import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadProfileImage } from "../middlewares/upload";
import {
  buildDevelopmentCredentials,
  resetParentCredentials,
  sendParentCredentials,
} from "../services/credentials.service";
import { generateTemporaryPassword, hashPassword } from "../services/password.service";
import {
  buildPaginatedResponse,
  normalizeEmail,
  optionalString,
  parseOptionalAccountStatusInput,
  parseOptionalBooleanInput,
  parsePaginationInput,
  parseStringArrayInput,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const parentInclude = {
  user: true,
  players: {
    include: {
      player: {
        include: {
          user: true,
        },
      },
    },
  },
} as const;

export const parentsRouter = Router();

parentsRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

parentsRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const search = optionalString(request.query.search ?? request.query.q);
    const searchTerms = search?.split(/\s+/).filter(Boolean) ?? [];
    const singleTermFilters: Prisma.ParentWhereInput[] = search
      ? [
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { lastName: { contains: search, mode: "insensitive" } } },
        ]
      : [];
    const multiTermFilter: Prisma.ParentWhereInput | null =
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
    const where: Prisma.ParentWhereInput = search
      ? {
          OR: multiTermFilter ? [...singleTermFilters, multiTermFilter] : singleTermFilters,
        }
      : {};
    const [parents, total] = await prisma.$transaction([
      prisma.parent.findMany({
        where,
        include: parentInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.parent.count({ where }),
    ]);

    response.json(buildPaginatedResponse(parents, total, pagination));
  }),
);

parentsRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const parentId = requireString(request.params.id, "id");
    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      include: parentInclude,
    });

    if (!parent) {
      throw new AppError("Roditelj nije pronađen.", 404);
    }

    response.json(parent);
  }),
);

parentsRouter.post(
  "/",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const playerIds = [...new Set(parseStringArrayInput(request.body.playerIds))];
    const primaryPlayerIds = new Set(parseStringArrayInput(request.body.primaryPlayerIds));
    const password = optionalString(request.body.password) ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(password);
    const profileImageUrl = await resolveUploadedImageUrl(
      request.file,
      `Parent ${request.body.email ?? "new"} profile image`,
      request.body.profileImageUrl,
    );

    const parent = await prisma.parent.create({
      data: {
        user: {
          create: {
            role: UserRole.PARENT,
            email: normalizeEmail(request.body.email, "email"),
            passwordHash,
            firstName: requireString(request.body.firstName, "firstName"),
            lastName: requireString(request.body.lastName, "lastName"),
            phone: requireString(request.body.phone, "phone"),
            profileImageUrl,
            accountStatus:
              parseOptionalAccountStatusInput(request.body.accountStatus) ?? AccountStatus.ACTIVE,
          },
        },
        players:
          playerIds.length > 0
            ? {
                create: playerIds.map((playerId) => ({
                  player: {
                    connect: { id: playerId },
                  },
                  isPrimaryContact: primaryPlayerIds.has(playerId),
                })),
              }
            : undefined,
      },
      include: parentInclude,
    });

    await sendParentCredentials(parent.id, password);

    response.status(201).json(parent);
  }),
);

parentsRouter.post(
  "/:id/resend-credentials",
  asyncHandler(async (request, response) => {
    const parentId = requireString(request.params.id, "id");
    const credentialDelivery = await resetParentCredentials(parentId);

    response.json({
      message: credentialDelivery.emailSent
        ? "Pristupni podaci roditelja su poslani."
        : "Lozinka je resetirana, ali slanje e-pošte nije konfigurirano.",
      emailSent: credentialDelivery.emailSent,
      developmentCredentials: buildDevelopmentCredentials(credentialDelivery),
    });
  }),
);

parentsRouter.patch(
  "/:id",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const parentId = requireString(request.params.id, "id");
    const playerIds = [...new Set(parseStringArrayInput(request.body.playerIds))];
    const primaryPlayerIds = new Set(parseStringArrayInput(request.body.primaryPlayerIds));
    const removeProfileImage = parseOptionalBooleanInput(request.body.removeProfileImage) ?? false;
    const existingParent = await prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        players: {
          select: {
            playerId: true,
          },
        },
      },
    });

    if (!existingParent) {
      throw new AppError("Roditelj nije pronađen.", 404);
    }

    if (request.body.playerIds !== undefined) {
      const nextPlayerIds = new Set(playerIds);
      const removedPlayerIds = existingParent.players
        .map((assignment) => assignment.playerId)
        .filter((playerId) => !nextPlayerIds.has(playerId));

      await ensureRemovedPlayersKeepAnotherParent(removedPlayerIds, parentId);
    }

    const parent = await prisma.parent.update({
      where: { id: parentId },
      data: {
        user: {
          update: {
            firstName: request.body.firstName ? requireString(request.body.firstName, "firstName") : undefined,
            lastName: request.body.lastName ? requireString(request.body.lastName, "lastName") : undefined,
            email: request.body.email ? normalizeEmail(request.body.email, "email") : undefined,
            phone: request.body.phone ? requireString(request.body.phone, "phone") : undefined,
            profileImageUrl:
              removeProfileImage
                ? null
                : request.file || request.body.profileImageUrl
                ? await resolveUploadedImageUrl(
                    request.file,
                    `Parent ${parentId} profile image`,
                    request.body.profileImageUrl,
                  )
                : undefined,
            accountStatus: parseOptionalAccountStatusInput(request.body.accountStatus),
          },
        },
        players:
          playerIds.length > 0 || request.body.playerIds
            ? {
                deleteMany: {},
                create: playerIds.map((playerId) => ({
                  player: {
                    connect: { id: playerId },
                  },
                  isPrimaryContact: primaryPlayerIds.has(playerId),
                })),
              }
            : undefined,
      },
      include: parentInclude,
    });

    response.json(parent);
  }),
);

parentsRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const parentId = requireString(request.params.id, "id");
    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        userId: true,
        players: {
          select: {
            playerId: true,
          },
        },
      },
    });

    if (!parent) {
      response.status(404).json({ message: "Roditelj nije pronađen." });
      return;
    }

    await ensureRemovedPlayersKeepAnotherParent(
      parent.players.map((assignment) => assignment.playerId),
      parentId,
    );

    await prisma.user.delete({
      where: { id: parent.userId },
    });

    response.status(204).send();
  }),
);

async function ensureRemovedPlayersKeepAnotherParent(playerIds: string[], removedParentId: string) {
  if (playerIds.length === 0) {
    return;
  }

  const orphanedPlayers = await prisma.player.findMany({
    where: {
      id: { in: playerIds },
      parents: {
        none: {
          parentId: { not: removedParentId },
        },
      },
    },
    include: {
      user: true,
    },
  });

  if (orphanedPlayers.length === 0) {
    return;
  }

  const playerNames = orphanedPlayers
    .map((player) => `${player.user.firstName} ${player.user.lastName}`)
    .join(", ");

  throw new AppError(
    `Nije moguće ukloniti roditelja jer bi sljedeći igrači ostali bez roditelja: ${playerNames}.`,
    400,
  );
}
