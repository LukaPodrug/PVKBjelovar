import { UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { uploadCategoryLogo } from "../middlewares/upload";
import {
  computeCategoriesLeaderboard,
  computeCategoryLeaderboard,
} from "../services/leaderboard.service";
import {
  parseLeaderboardWindow,
  parseOptionalBooleanInput,
  parseOptionalDateInput,
  parsePaginationInput,
  parseStringArrayInput,
  buildPaginatedResponse,
  requireString,
} from "../utils/request-parsers";
import { resolveUploadedImageUrl } from "../utils/upload-helpers";

const categoryInclude = {
  coaches: {
    include: {
      coach: {
        include: {
          user: true,
        },
      },
    },
  },
  _count: {
    select: {
      players: true,
    },
  },
} as const;

const categoryPlayerInclude = {
  player: {
    include: {
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
    },
  },
} as const;

const defaultPublicCategoryPlayersLimit = 24;
const maxPublicCategoryPlayersLimit = 48;

export const categoriesRouter = Router();

categoriesRouter.get(
  "/public",
  asyncHandler(async (_request, response) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ endDateOfBirth: "asc" }, { name: "asc" }],
    });

    response.json(categories);
  }),
);

categoriesRouter.get(
  "/public/:id",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    const playersLimit = parsePositiveIntegerQuery(
      request.query.playersLimit,
      defaultPublicCategoryPlayersLimit,
      maxPublicCategoryPlayersLimit,
    );
    const playersOffset = parsePositiveIntegerQuery(request.query.playersOffset, 0);
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        coaches: {
          include: {
            coach: {
              include: {
                user: true,
              },
            },
          },
        },
        _count: {
          select: {
            players: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError("Kategorija nije pronađena.", 404);
    }

    const coaches = [...category.coaches]
      .sort((left, right) => compareUsers(left.coach.user, right.coach.user))
      .map((assignment) => ({
        coachId: assignment.coachId,
        coach: {
          id: assignment.coach.id,
          isConditioningCoach: assignment.coach.isConditioningCoach,
          user: {
            id: assignment.coach.user.id,
            firstName: assignment.coach.user.firstName,
            lastName: assignment.coach.user.lastName,
          },
        },
      }));

    const players = await prisma.player.findMany({
      where: {
        categories: {
          some: {
            categoryId,
          },
        },
      },
      include: {
        user: true,
      },
      orderBy: [
        {
          user: {
            lastName: "asc",
          },
        },
        {
          user: {
            firstName: "asc",
          },
        },
        {
          id: "asc",
        },
      ],
      skip: playersOffset,
      take: playersLimit,
    });

    const playerItems = players.map((player) => ({
      playerId: player.id,
      player: {
        id: player.id,
        user: {
          id: player.user.id,
          firstName: player.user.firstName,
          lastName: player.user.lastName,
        },
      },
    }));
    const playerCount = category._count.players;
    const nextPlayersOffset =
      playersOffset + playerItems.length < playerCount ? playersOffset + playerItems.length : null;

    response.json({
      id: category.id,
      name: category.name,
      logoUrl: category.logoUrl,
      startDateOfBirth: category.startDateOfBirth,
      endDateOfBirth: category.endDateOfBirth,
      coaches,
      playerCount,
      players: playerItems,
      nextPlayersOffset,
    });
  }),
);

categoriesRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN, UserRole.COACH));

categoriesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const pagination = parsePaginationInput(request.query);
    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        include: categoryInclude,
        orderBy: {
          endDateOfBirth: "asc",
        },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.category.count(),
    ]);

    response.json(
      buildPaginatedResponse(categories.map(serializeCategory), total, pagination),
    );
  }),
);

categoriesRouter.get(
  "/leaderboard",
  asyncHandler(async (request, response) => {
    const requestedCategoryIds = [
      ...new Set(parseStringArrayInput(request.query.categoryIds ?? request.query.categoryId)),
    ];
    const categories = await prisma.category.findMany({
      where:
        requestedCategoryIds.length > 0
          ? { id: { in: requestedCategoryIds } }
          : undefined,
      orderBy: {
        endDateOfBirth: "asc",
      },
      select: { id: true, name: true },
    });

    if (requestedCategoryIds.length > 0 && categories.length !== requestedCategoryIds.length) {
      throw new AppError("Jedna ili više kategorija nije pronađena.", 404);
    }

    const window = parseLeaderboardWindow(request.query);
    const pagination = parsePaginationInput(request.query);
    const categoryIds = categories.map((category) => category.id);
    const leaderboard = await computeCategoriesLeaderboard(categoryIds, window, pagination);

    response.json({
      ...leaderboard,
      categoryName:
        categoryIds.length === 1
          ? categories[0]?.name
          : categoryIds.length > 0
            ? "Sve odabrane kategorije"
            : "Sve kategorije",
    });
  }),
);

categoriesRouter.get(
  "/:id/leaderboard",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true },
    });

    if (!category) {
      throw new AppError("Kategorija nije pronađena.", 404);
    }

    const window = parseLeaderboardWindow(request.query);
    const pagination = parsePaginationInput(request.query);
    const leaderboard = await computeCategoryLeaderboard(categoryId, window, pagination);

    response.json({ ...leaderboard, categoryName: category.name });
  }),
);

categoriesRouter.post(
  "/start-new-season",
  authorizeRoles(UserRole.ADMIN),
  asyncHandler(async (_request, response) => {
    const result = await prisma.$transaction(async (transaction) => {
      const categories = await transaction.category.findMany({
        orderBy: {
          endDateOfBirth: "asc",
        },
        select: {
          id: true,
          endDateOfBirth: true,
          startDateOfBirth: true,
        },
        where: {
          endDateOfBirth: {
            not: null,
          },
        },
      });

      if (categories.length === 0) {
        throw new AppError("Najprije kreirajte barem jednu kategoriju.", 400);
      }

      const updatedCategories = await Promise.all(
        categories.map((category) =>
          transaction.category.update({
            where: { id: category.id },
            data: {
              endDateOfBirth: category.endDateOfBirth
                ? addYears(category.endDateOfBirth, 1)
                : null,
            },
            select: {
              id: true,
              endDateOfBirth: true,
            },
          }),
        ),
      );

      const players = await transaction.player.findMany({
        select: {
          id: true,
          dateOfBirth: true,
        },
      });

      const orderedUpdatedCategories = [...updatedCategories].sort(
        (left, right) =>
          (left.endDateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY) -
          (right.endDateOfBirth?.getTime() ?? Number.POSITIVE_INFINITY),
      );

      const playerAssignments = players
        .map((player) => {
          const categoryId = findCategoryIdForDateOfBirth(
            player.dateOfBirth,
            orderedUpdatedCategories,
          );

          return categoryId
            ? {
                playerId: player.id,
                categoryId,
              }
            : null;
        })
        .filter(
          (
            assignment,
          ): assignment is {
            playerId: string;
            categoryId: string;
          } => assignment !== null,
        );

      await transaction.playerCategory.deleteMany({});

      if (playerAssignments.length > 0) {
        await transaction.playerCategory.createMany({
          data: playerAssignments,
        });
      }

      return {
        categoriesUpdated: updatedCategories.length,
        playersReassigned: playerAssignments.length,
      };
    });

    response.json(result);
  }),
);

categoriesRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: categoryInclude,
    });

    if (!category) {
      throw new AppError("Kategorija nije pronađena.", 404);
    }

    response.json(serializeCategory(category));
  }),
);

categoriesRouter.get(
  "/:id/players",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    const pagination = parsePaginationInput(request.query, {
      defaultPageSize: 10,
      maxPageSize: 50,
    });

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new AppError("Kategorija nije pronađena.", 404);
    }

    const [assignments, total] = await prisma.$transaction([
      prisma.playerCategory.findMany({
        where: { categoryId },
        include: categoryPlayerInclude,
        orderBy: [
          {
            player: {
              user: {
                lastName: "asc",
              },
            },
          },
          {
            player: {
              user: {
                firstName: "asc",
              },
            },
          },
          {
            playerId: "asc",
          },
        ],
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.playerCategory.count({
        where: { categoryId },
      }),
    ]);

    response.json(buildPaginatedResponse(assignments, total, pagination));
  }),
);

function addYears(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + amount);
  return nextDate;
}

function findCategoryIdForDateOfBirth(
  dateOfBirth: Date,
  categories: Array<{ id: string; endDateOfBirth: Date | null }>,
) {
  const exactMatch = categories.find(
    (category) => category.endDateOfBirth && dateOfBirth <= category.endDateOfBirth,
  );

  return exactMatch?.id ?? categories[categories.length - 1]?.id ?? null;
}

function compareUsers(
  left: { firstName: string; lastName: string },
  right: { firstName: string; lastName: string },
) {
  return `${left.lastName} ${left.firstName}`.localeCompare(
    `${right.lastName} ${right.firstName}`,
    "hr",
  );
}

function parsePositiveIntegerQuery(
  value: unknown,
  fallback: number,
  maximum?: number,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError("Vrijednost paginacije nije ispravna.", 400);
  }

  if (maximum !== undefined) {
    return Math.min(parsed, maximum);
  }

  return parsed;
}

categoriesRouter.post(
  "/",
  uploadCategoryLogo,
  asyncHandler(async (request, response) => {
    const coachIds = parseStringArrayInput(request.body.coachIds);
    const logoUrl = await resolveUploadedImageUrl(
      request.file,
      `Category ${requireString(request.body.name, "name")} logo`,
      request.body.logoUrl,
    );

    const startDateOfBirth = parseOptionalDateInput(request.body.startDateOfBirth);
    const endDateOfBirth = parseOptionalDateInput(request.body.endDateOfBirth);

    if (startDateOfBirth && endDateOfBirth) {
      throw new AppError("Kategorija može imati početnu ili završnu granicu datuma rođenja, ne oboje.", 400);
    }

    const category = await prisma.category.create({
      data: {
        name: requireString(request.body.name, "name"),
        logoUrl,
        startDateOfBirth,
        endDateOfBirth,
        coaches:
          coachIds.length > 0
            ? {
                create: coachIds.map((coachId) => ({
                  coach: {
                    connect: { id: coachId },
                  },
                })),
              }
            : undefined,
      },
      include: categoryInclude,
    });

    response.status(201).json(serializeCategory(category));
  }),
);

categoriesRouter.patch(
  "/:id",
  uploadCategoryLogo,
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    const coachIds = parseStringArrayInput(request.body.coachIds);
    const removeLogo = parseOptionalBooleanInput(request.body.removeLogo) ?? false;
    const startDateOfBirth =
      request.body.startDateOfBirth !== undefined
        ? parseOptionalDateInput(request.body.startDateOfBirth)
        : undefined;
    const endDateOfBirth =
      request.body.endDateOfBirth !== undefined
        ? parseOptionalDateInput(request.body.endDateOfBirth)
        : undefined;

    if (startDateOfBirth && endDateOfBirth) {
      throw new AppError("Kategorija može imati početnu ili završnu granicu datuma rođenja, ne oboje.", 400);
    }

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: request.body.name ? requireString(request.body.name, "name") : undefined,
        logoUrl:
          removeLogo
            ? null
            : request.file || request.body.logoUrl
            ? await resolveUploadedImageUrl(
                request.file,
                `Category ${categoryId} logo`,
                request.body.logoUrl,
              )
            : undefined,
        startDateOfBirth,
        endDateOfBirth,
        coaches:
          coachIds.length > 0 || request.body.coachIds
            ? {
                deleteMany: {},
                create: coachIds.map((coachId) => ({
                  coach: {
                    connect: { id: coachId },
                  },
                })),
              }
            : undefined,
      },
      include: categoryInclude,
    });

    response.json(serializeCategory(category));
  }),
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.params.id, "id");
    await prisma.category.delete({
      where: { id: categoryId },
    });

    response.status(204).send();
  }),
);

function serializeCategory(category: {
  id: string;
  name: string;
  logoUrl: string | null;
  startDateOfBirth: Date | null;
  endDateOfBirth: Date | null;
  coaches: unknown[];
  _count: {
    players: number;
  };
}) {
  return {
    id: category.id,
    name: category.name,
    logoUrl: category.logoUrl,
    startDateOfBirth: category.startDateOfBirth,
    endDateOfBirth: category.endDateOfBirth,
    coaches: category.coaches,
    playerCount: category._count.players,
  };
}
