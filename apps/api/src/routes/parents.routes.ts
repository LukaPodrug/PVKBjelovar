import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadProfileImage } from "../middlewares/upload";
import { hashPassword } from "../services/password.service";
import {
  buildPaginatedResponse,
  normalizeEmail,
  optionalString,
  parseOptionalAccountStatusInput,
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
    const where: Prisma.ParentWhereInput = search
      ? {
          OR: [
            { user: { firstName: { contains: search, mode: "insensitive" } } },
            { user: { lastName: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { user: { phone: { contains: search, mode: "insensitive" } } },
            {
              players: {
                some: {
                  player: {
                    OR: [
                      { oib: { contains: search, mode: "insensitive" } },
                      { user: { firstName: { contains: search, mode: "insensitive" } } },
                      { user: { lastName: { contains: search, mode: "insensitive" } } },
                      { user: { username: { contains: search, mode: "insensitive" } } },
                    ],
                  },
                },
              },
            },
          ],
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
    const playerIds = parseStringArrayInput(request.body.playerIds);
    const primaryPlayerIds = new Set(parseStringArrayInput(request.body.primaryPlayerIds));
    const passwordHash = await hashPassword(requireString(request.body.password, "password"));
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

    response.status(201).json(parent);
  }),
);

parentsRouter.patch(
  "/:id",
  uploadProfileImage,
  asyncHandler(async (request, response) => {
    const parentId = requireString(request.params.id, "id");
    const playerIds = parseStringArrayInput(request.body.playerIds);
    const primaryPlayerIds = new Set(parseStringArrayInput(request.body.primaryPlayerIds));

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
              request.file || request.body.profileImageUrl
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
      select: { userId: true },
    });

    if (!parent) {
      response.status(404).json({ message: "Roditelj nije pronađen." });
      return;
    }

    await prisma.user.delete({
      where: { id: parent.userId },
    });

    response.status(204).send();
  }),
);
