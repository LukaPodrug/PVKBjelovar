import { AccountStatus, NotificationType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { notifyPlayerParents } from "../services/notification.service";
import { buildDefaultPlayerUsername, parseUsernameInput } from "../services/username.service";
import { formatDateHr } from "../utils/datetime";
import { uploadProfileImage } from "../middlewares/upload";
import {
  optionalString,
  buildPaginatedResponse,
  parseBooleanInput,
  parseDateInput,
  parseOptionalAccountStatusInput,
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
    const categoryId = optionalString(request.query.categoryId);
    const filters: Prisma.PlayerWhereInput[] = [];

    if (categoryId) {
      filters.push({ categories: { some: { categoryId } } });
    }

    if (search) {
      filters.push({
        OR: [
          { oib: { contains: search, mode: "insensitive" } },
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { lastName: { contains: search, mode: "insensitive" } } },
          { user: { username: { contains: search, mode: "insensitive" } } },
          { user: { phone: { contains: search, mode: "insensitive" } } },
          {
            categories: {
              some: { category: { name: { contains: search, mode: "insensitive" } } },
            },
          },
          {
            parents: {
              some: {
                parent: {
                  user: {
                    OR: [
                      { firstName: { contains: search, mode: "insensitive" } },
                      { lastName: { contains: search, mode: "insensitive" } },
                      { email: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
          },
        ],
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
    const parentIds = parseStringArrayInput(request.body.parentIds);
    const primaryParentId = optionalString(request.body.primaryParentId);
    const firstName = requireString(request.body.firstName, "firstName");
    const lastName = requireString(request.body.lastName, "lastName");
    const oib = requireString(request.body.oib, "oib");
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

    const player = await prisma.player.create({
      data: {
        dateOfBirth: parseDateInput(request.body.dateOfBirth, "dateOfBirth"),
        oib,
        gdprConsent: parseBooleanInput(request.body.gdprConsent, "gdprConsent"),
        membershipExpiresAt: parseOptionalDateInput(request.body.membershipExpiresAt),
        user: {
          create: {
            role: UserRole.PLAYER,
            username,
            firstName,
            lastName,
            phone: optionalString(request.body.phone),
            profileImageUrl,
            accountStatus:
              parseOptionalAccountStatusInput(request.body.accountStatus) ?? AccountStatus.ACTIVE,
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

    response.status(201).json(player);
  }),
);

playersRouter.patch(
  "/:id",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.id, "id");
    const categoryIds = parseStringArrayInput(request.body.categoryIds);
    const parentIds = parseStringArrayInput(request.body.parentIds);
    const primaryParentId = optionalString(request.body.primaryParentId);
    const existingPlayer = await prisma.player.findUnique({
      where: {
        id: playerId,
      },
      select: {
        id: true,
        userId: true,
        membershipExpiresAt: true,
      },
    });

    if (!existingPlayer) {
      throw new AppError("Igrač nije pronađen.", 404);
    }

    const username =
      request.body.username !== undefined ? parseUsernameInput(request.body.username) : undefined;

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
            username,
            phone: request.body.phone !== undefined ? optionalString(request.body.phone) : undefined,
            profileImageUrl:
              request.file || request.body.profileImageUrl
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
