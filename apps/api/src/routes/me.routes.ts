import { DevicePlatform, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { computeCategoryLeaderboard } from "../services/leaderboard.service";
import { isExpoPushToken } from "../services/push.service";
import { parseLeaderboardWindow, parsePaginationInput, requireString } from "../utils/request-parsers";
import {
  type ScheduleAccessContext,
  listCalendarItems,
  parseWeekStartDateInput,
} from "./schedules.routes";

export const meRouter = Router();

// Every /me route requires authentication. Child-scoped endpoints are parent-only; the
// notifications inbox and push-device registration are shared by parents and players.
meRouter.use(authenticateRequest);

const parentOnly = authorizeRoles(UserRole.PARENT);
const playerOnly = authorizeRoles(UserRole.PLAYER);
const parentOrPlayer = authorizeRoles(UserRole.PARENT, UserRole.PLAYER);

interface ResolvedChild {
  playerId: string;
  isPrimaryContact: boolean;
  categoryIds: string[];
}

/**
 * Loads the authenticated parent's link to a specific child, guaranteeing a parent can only ever
 * read data for their own children. Throws 403/404 when the link is missing.
 */
async function resolveParentChild(userId: string, playerId: string): Promise<ResolvedChild> {
  const parent = await prisma.parent.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!parent) {
    throw new AppError("Roditeljski profil nije pronađen.", 403);
  }

  const link = await prisma.parentPlayer.findUnique({
    where: {
      parentId_playerId: {
        parentId: parent.id,
        playerId,
      },
    },
    select: {
      isPrimaryContact: true,
      player: {
        select: {
          categories: {
            select: {
              categoryId: true,
            },
          },
        },
      },
    },
  });

  if (!link) {
    throw new AppError("Nemate pristup ovom djetetu.", 404);
  }

  return {
    playerId,
    isPrimaryContact: link.isPrimaryContact,
    categoryIds: link.player.categories.map((assignment) => assignment.categoryId),
  };
}

interface AttendanceSummary {
  attended: number;
  total: number;
  percentage: number;
}

/**
 * Attendance is only meaningful on occurrences that actually exist (weekly templates only produce
 * occurrences once activated), so the denominator is non-cancelled occurrences whose date has
 * already passed, scoped to the child's categories.
 */
async function computeAttendanceSummary(
  playerId: string,
  categoryIds: string[],
  now: Date,
): Promise<AttendanceSummary> {
  if (categoryIds.length === 0) {
    return { attended: 0, total: 0, percentage: 0 };
  }

  const occurrenceScope = {
    isCancelled: false,
    occurrenceDate: { lte: now },
    schedule: {
      categoryId: { in: categoryIds },
    },
  } as const;

  const [total, attended] = await Promise.all([
    prisma.scheduleOccurrence.count({ where: occurrenceScope }),
    prisma.scheduleAttendance.count({
      where: {
        playerId,
        occurrence: occurrenceScope,
      },
    }),
  ]);

  return {
    attended,
    total,
    percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
  };
}

meRouter.get(
  "/children",
  parentOnly,
  asyncHandler(async (request, response) => {
    const parent = await prisma.parent.findUnique({
      where: { userId: request.auth!.userId },
      select: {
        players: {
          orderBy: {
            player: {
              user: {
                firstName: "asc",
              },
            },
          },
          select: {
            isPrimaryContact: true,
            player: {
              select: {
                id: true,
                dateOfBirth: true,
                membershipExpiresAt: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    profileImageUrl: true,
                  },
                },
                categories: {
                  select: {
                    category: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      throw new AppError("Roditeljski profil nije pronađen.", 403);
    }

    const now = new Date();
    const children = await Promise.all(
      parent.players.map(async (link) => {
        const categories = link.player.categories.map((assignment) => assignment.category);
        const attendance = await computeAttendanceSummary(
          link.player.id,
          categories.map((category) => category.id),
          now,
        );

        return {
          playerId: link.player.id,
          firstName: link.player.user.firstName,
          lastName: link.player.user.lastName,
          profileImageUrl: link.player.user.profileImageUrl,
          dateOfBirth: link.player.dateOfBirth.toISOString(),
          isPrimaryContact: link.isPrimaryContact,
          membershipExpiresAt: link.player.membershipExpiresAt?.toISOString() ?? null,
          categories,
          attendance,
        };
      }),
    );

    response.json(children);
  }),
);

meRouter.get(
  "/children/:playerId",
  parentOnly,
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.playerId, "playerId");
    const child = await resolveParentChild(request.auth!.userId, playerId);

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        dateOfBirth: true,
        membershipExpiresAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        parents: {
          select: {
            isPrimaryContact: true,
            parent: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!player) {
      throw new AppError("Igrač nije pronađen.", 404);
    }

    const attendance = await computeAttendanceSummary(playerId, child.categoryIds, new Date());

    response.json({
      playerId: player.id,
      firstName: player.user.firstName,
      lastName: player.user.lastName,
      profileImageUrl: player.user.profileImageUrl,
      dateOfBirth: player.dateOfBirth.toISOString(),
      isPrimaryContact: child.isPrimaryContact,
      membershipExpiresAt: player.membershipExpiresAt?.toISOString() ?? null,
      categories: player.categories.map((assignment) => assignment.category),
      contacts: player.parents.map((link) => ({
        firstName: link.parent.user.firstName,
        lastName: link.parent.user.lastName,
        email: link.parent.user.email,
        phone: link.parent.user.phone,
        isPrimaryContact: link.isPrimaryContact,
      })),
      attendance,
    });
  }),
);

meRouter.get(
  "/children/:playerId/schedule",
  parentOnly,
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.playerId, "playerId");
    const child = await resolveParentChild(request.auth!.userId, playerId);
    const weekStartDate = parseWeekStartDateInput(request.query.weekStart);

    const access: ScheduleAccessContext = {
      role: UserRole.PARENT,
      userId: request.auth!.userId,
      coachId: null,
      isConditioningCoach: false,
      categoryIds: child.categoryIds,
    };

    const items = await listCalendarItems({
      weekStartDate,
      includeCancelled: true,
      access,
    });

    const occurrenceIds = items
      .map((item) => item.occurrenceId)
      .filter((occurrenceId): occurrenceId is string => occurrenceId !== null);

    const attendedRecords =
      occurrenceIds.length > 0
        ? await prisma.scheduleAttendance.findMany({
            where: {
              playerId,
              occurrenceId: { in: occurrenceIds },
            },
            select: { occurrenceId: true },
          })
        : [];

    const attendedOccurrenceIds = new Set(attendedRecords.map((record) => record.occurrenceId));

    response.json(
      items.map((item) => ({
        ...item,
        attended: item.occurrenceId ? attendedOccurrenceIds.has(item.occurrenceId) : false,
      })),
    );
  }),
);

meRouter.get(
  "/children/:playerId/attendance",
  parentOnly,
  asyncHandler(async (request, response) => {
    const playerId = requireString(request.params.playerId, "playerId");
    const child = await resolveParentChild(request.auth!.userId, playerId);
    const now = new Date();
    const summary = await computeAttendanceSummary(playerId, child.categoryIds, now);

    const recentOccurrences =
      child.categoryIds.length > 0
        ? await prisma.scheduleOccurrence.findMany({
            where: {
              isCancelled: false,
              occurrenceDate: { lte: now },
              schedule: {
                categoryId: { in: child.categoryIds },
              },
            },
            orderBy: {
              occurrenceDate: "desc",
            },
            take: 10,
            select: {
              id: true,
              occurrenceDate: true,
              practiceType: true,
              schedule: {
                select: {
                  category: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
              attendanceRecords: {
                where: { playerId },
                select: { playerId: true },
              },
            },
          })
        : [];

    response.json({
      ...summary,
      recent: recentOccurrences.map((occurrence) => ({
        occurrenceId: occurrence.id,
        occurrenceDate: occurrence.occurrenceDate.toISOString().slice(0, 10),
        practiceType: occurrence.practiceType,
        categoryName: occurrence.schedule.category?.name ?? "Sve kategorije",
        attended: occurrence.attendanceRecords.length > 0,
      })),
    });
  }),
);

function parseDevicePlatform(value: unknown): DevicePlatform {
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (normalized === "IOS" || normalized === "ANDROID" || normalized === "WEB") {
      return normalized as DevicePlatform;
    }
  }

  return DevicePlatform.ANDROID;
}

meRouter.post(
  "/push-devices",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const expoPushToken = requireString(request.body.expoPushToken, "expoPushToken");

    if (!isExpoPushToken(expoPushToken)) {
      throw new AppError("Push token nije u ispravnom Expo formatu.", 400);
    }

    const platform = parseDevicePlatform(request.body.platform);
    const now = new Date();

    // Upsert by token so re-registering the same device refreshes ownership and last-seen instead
    // of creating duplicates (a device may be handed between accounts).
    await prisma.pushDevice.upsert({
      where: { expoPushToken },
      create: {
        expoPushToken,
        platform,
        userId: request.auth!.userId,
        lastSeenAt: now,
      },
      update: {
        platform,
        userId: request.auth!.userId,
        lastSeenAt: now,
      },
    });

    response.status(201).json({ message: "Uređaj je registriran za obavijesti." });
  }),
);

meRouter.delete(
  "/push-devices/:token",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const expoPushToken = requireString(request.params.token, "token");

    await prisma.pushDevice.deleteMany({
      where: {
        expoPushToken,
        userId: request.auth!.userId,
      },
    });

    response.status(204).send();
  }),
);

meRouter.get(
  "/notifications",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.auth!.userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: { userId: request.auth!.userId, readAt: null },
      }),
    ]);

    response.json({
      unreadCount,
      notifications: notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
    });
  }),
);

meRouter.patch(
  "/notifications/read-all",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    await prisma.notification.updateMany({
      where: { userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });

    response.json({ message: "Sve obavijesti su označene kao pročitane." });
  }),
);

meRouter.patch(
  "/notifications/:id/read",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const notificationId = requireString(request.params.id, "id");

    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId: request.auth!.userId },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new AppError("Obavijest nije pronađena.", 404);
    }

    response.json({ message: "Obavijest je označena kao pročitana." });
  }),
);

meRouter.get(
  "/categories",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const { userId, role } = request.auth!;
    const categoryMap = new Map<string, { id: string; name: string }>();

    if (role === UserRole.PLAYER) {
      const player = await prisma.player.findUnique({
        where: { userId },
        select: {
          categories: {
            select: { category: { select: { id: true, name: true } } },
          },
        },
      });
      player?.categories.forEach((assignment) =>
        categoryMap.set(assignment.category.id, assignment.category),
      );
    } else {
      const parent = await prisma.parent.findUnique({
        where: { userId },
        select: {
          players: {
            select: {
              player: {
                select: {
                  categories: {
                    select: { category: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          },
        },
      });
      parent?.players.forEach((link) =>
        link.player.categories.forEach((assignment) =>
          categoryMap.set(assignment.category.id, assignment.category),
        ),
      );
    }

    const categories = [...categoryMap.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "hr-HR"),
    );

    response.json(categories);
  }),
);

/**
 * Resolves which player rows the requester is allowed to see highlighted on a category leaderboard,
 * and doubles as the access guard: a player must belong to the category, a parent must have at least
 * one child in it.
 */
async function resolveLeaderboardHighlight(
  auth: { userId: string; role: UserRole },
  categoryId: string,
): Promise<string[]> {
  if (auth.role === UserRole.PLAYER) {
    const player = await prisma.player.findFirst({
      where: { userId: auth.userId, categories: { some: { categoryId } } },
      select: { id: true },
    });

    if (!player) {
      throw new AppError("Nemate pristup poretku ove kategorije.", 403);
    }

    return [player.id];
  }

  const parent = await prisma.parent.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });

  if (!parent) {
    throw new AppError("Roditeljski profil nije pronađen.", 403);
  }

  const links = await prisma.parentPlayer.findMany({
    where: {
      parentId: parent.id,
      player: { categories: { some: { categoryId } } },
    },
    select: { playerId: true },
  });

  if (links.length === 0) {
    throw new AppError("Nemate pristup poretku ove kategorije.", 403);
  }

  return links.map((link) => link.playerId);
}

meRouter.get(
  "/leaderboard",
  parentOrPlayer,
  asyncHandler(async (request, response) => {
    const categoryId = requireString(request.query.categoryId, "categoryId");
    const highlightPlayerIds = await resolveLeaderboardHighlight(request.auth!, categoryId);
    const window = parseLeaderboardWindow(request.query);
    const pagination = parsePaginationInput(request.query);
    const leaderboard = await computeCategoryLeaderboard(categoryId, window, pagination);

    response.json({ ...leaderboard, highlightPlayerIds });
  }),
);

meRouter.get(
  "/schedule",
  playerOnly,
  asyncHandler(async (request, response) => {
    const player = await prisma.player.findUnique({
      where: { userId: request.auth!.userId },
      select: {
        id: true,
        categories: { select: { categoryId: true } },
      },
    });

    if (!player) {
      throw new AppError("Profil igrača nije pronađen.", 403);
    }

    const categoryIds = player.categories.map((assignment) => assignment.categoryId);
    const weekStartDate = parseWeekStartDateInput(request.query.weekStart);

    const access: ScheduleAccessContext = {
      role: UserRole.PLAYER,
      userId: request.auth!.userId,
      coachId: null,
      isConditioningCoach: false,
      categoryIds,
    };

    const items = await listCalendarItems({
      weekStartDate,
      includeCancelled: true,
      access,
    });

    const occurrenceIds = items
      .map((item) => item.occurrenceId)
      .filter((occurrenceId): occurrenceId is string => occurrenceId !== null);

    const attendedRecords =
      occurrenceIds.length > 0
        ? await prisma.scheduleAttendance.findMany({
            where: {
              playerId: player.id,
              occurrenceId: { in: occurrenceIds },
            },
            select: { occurrenceId: true },
          })
        : [];

    const attendedOccurrenceIds = new Set(attendedRecords.map((record) => record.occurrenceId));

    response.json(
      items.map((item) => ({
        ...item,
        attended: item.occurrenceId ? attendedOccurrenceIds.has(item.occurrenceId) : false,
      })),
    );
  }),
);
