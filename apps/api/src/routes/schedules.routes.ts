import { randomBytes } from "node:crypto";
import { DayOfWeek, NotificationType, PracticeType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../lib/async-handler";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../middlewares/authenticate";
import { authorizeRoles } from "../middlewares/authorize";
import { deriveDayOfWeek, resolveScheduleCoachIds } from "../services/category.service";
import { notifyCategoryAudience } from "../services/notification.service";
import { attendanceQrTokenPrefix, parseAttendanceQrToken } from "../services/username.service";
import { formatDateHr, formatTimeRangeHr } from "../utils/datetime";
import {
  parseBooleanInput,
  parseDateInput,
  parseDayOfWeekInput,
  parsePracticeTypeInput,
  parseStringArrayInput,
  requireString,
} from "../utils/request-parsers";

const attendanceQrSessionLifetimeMs = 10 * 60 * 1000;

const scheduleCoachInclude = {
  include: {
    coach: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  },
} as const;

const occurrenceCoachInclude = {
  include: {
    coach: {
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  },
} as const;

const weeklyScheduleSlotOrderBy: Prisma.ScheduleOrderByWithRelationInput[] = [
  { dayOfWeek: "asc" },
  { startTime: "asc" },
];

const scheduleOccurrenceSelect = {
  id: true,
  occurrenceDate: true,
  isCancelled: true,
  activationId: true,
  practiceType: true,
  startTime: true,
  endTime: true,
  notes: true,
} as const;

const scheduleInclude = {
  category: true,
  weeklySchedule: {
    select: {
      id: true,
      name: true,
    },
  },
  coaches: scheduleCoachInclude,
  occurrences: {
    select: scheduleOccurrenceSelect,
    orderBy: {
      occurrenceDate: "asc",
    },
  },
} as const;

const weeklyScheduleInclude = {
  category: true,
  schedules: {
    where: {
      isArchived: false,
    },
    include: {
      coaches: scheduleCoachInclude,
    },
    orderBy: weeklyScheduleSlotOrderBy,
  },
  activations: {
    select: {
      id: true,
      weekStartDate: true,
      createdAt: true,
      activatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      weekStartDate: "desc",
    },
  },
} as const;

const weeklyOccurrenceInclude = {
  coaches: occurrenceCoachInclude,
  schedule: {
    include: {
      category: true,
      weeklySchedule: {
        select: {
          id: true,
          name: true,
        },
      },
      coaches: scheduleCoachInclude,
    },
  },
} as const;

const specialOccurrenceInclude = {
  id: true,
  occurrenceDate: true,
  isCancelled: true,
  practiceType: true,
  startTime: true,
  endTime: true,
  notes: true,
  coaches: occurrenceCoachInclude,
} as const;

export interface ScheduleAccessContext {
  role: UserRole;
  userId: string;
  coachId: string | null;
  isConditioningCoach: boolean;
  categoryIds: string[] | null;
}

interface ParsedSpecialSchedulePayload {
  categoryId: string;
  practiceType: PracticeType;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  coachIds: string[];
}

interface ParsedWeeklyScheduleSlotPayload {
  id?: string;
  dayOfWeek: DayOfWeek;
  practiceType: PracticeType;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  coachIds: string[];
}

interface ParsedWeeklySchedulePayload {
  categoryId: string;
  name: string;
  description: string | null;
  slots: ParsedWeeklyScheduleSlotPayload[];
}

export interface CalendarItem {
  id: string;
  scheduleId: string;
  occurrenceId: string | null;
  occurrenceDate: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isCancelled: boolean;
  sourceType: "WEEKLY_TEMPLATE" | "SPECIAL_PRACTICE";
  weeklyScheduleId: string | null;
  weeklyScheduleName: string | null;
  category: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  coaches: Array<{
    coachId: string;
    coach: {
      id: string;
      user: {
        id: string;
        firstName: string;
        lastName: string;
      };
    };
  }>;
}

export const schedulesRouter = Router();

schedulesRouter.get(
  "/public",
  asyncHandler(async (request, response) => {
    const categoryId = typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;
    const weekStartDate = parseWeekStartDateInput(request.query.weekStart);
    const calendarItems = await listCalendarItems({
      weekStartDate,
      categoryId,
      includeCancelled: false,
    });

    response.json(calendarItems);
  }),
);

schedulesRouter.post(
  "/attendance-qr/scan",
  authenticateRequest,
  authorizeRoles(UserRole.PLAYER),
  asyncHandler(async (request, response) => {
    const player = await prisma.player.findUnique({
      where: {
        userId: request.auth!.userId,
      },
      select: {
        id: true,
        categories: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    if (!player) {
      throw new AppError("Prijavljeni korisnik nema aktivan profil igrača.", 403);
    }

    const qrToken = parseAttendanceQrToken(
      request.body.qrToken ?? request.body.token ?? request.body.qrValue,
    );
    const now = new Date();
    const qrSession = await prisma.attendanceQrSession.findUnique({
      where: {
        token: qrToken,
      },
      select: {
        id: true,
        expiresAt: true,
        occurrence: {
          select: {
            id: true,
            occurrenceDate: true,
            practiceType: true,
            startTime: true,
            endTime: true,
            isCancelled: true,
            schedule: {
              select: {
                categoryId: true,
                startTime: true,
                endTime: true,
                category: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!qrSession || qrSession.expiresAt <= now) {
      throw new AppError("QR kod je istekao ili nije valjan.", 400);
    }

    if (qrSession.occurrence.isCancelled) {
      throw new AppError("Ovaj trening je označen kao otkazan.", 400);
    }

    const belongsToCategory = player.categories.some(
      (assignment) => assignment.categoryId === qrSession.occurrence.schedule.categoryId,
    );

    if (!belongsToCategory) {
      throw new AppError("Ovaj QR kod nije namijenjen vašoj kategoriji.", 403);
    }

    await prisma.scheduleAttendance.upsert({
      where: {
        occurrenceId_playerId: {
          occurrenceId: qrSession.occurrence.id,
          playerId: player.id,
        },
      },
      create: {
        occurrenceId: qrSession.occurrence.id,
        playerId: player.id,
      },
      update: {
        markedAt: now,
      },
    });

    response.json({
      message: "Dolazak je uspješno evidentiran.",
      occurrenceId: qrSession.occurrence.id,
      occurrenceDate: getOccurrenceDateKey(qrSession.occurrence.occurrenceDate),
      practiceType: qrSession.occurrence.practiceType,
      categoryName: qrSession.occurrence.schedule.category.name,
      startTime:
        qrSession.occurrence.startTime?.toISOString() ??
        copyTimeOfDay(
          qrSession.occurrence.occurrenceDate,
          qrSession.occurrence.schedule.startTime,
        ).toISOString(),
      endTime:
        qrSession.occurrence.endTime?.toISOString() ??
        copyTimeOfDay(
          qrSession.occurrence.occurrenceDate,
          qrSession.occurrence.schedule.endTime,
        ).toISOString(),
    });
  }),
);

schedulesRouter.use(authenticateRequest, authorizeRoles(UserRole.ADMIN, UserRole.COACH));

schedulesRouter.get(
  "/calendar",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const categoryId = typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;
    const assignedOnly = request.query.assignedOnly === "true";
    const includeCancelled = request.query.includeCancelled !== "false";
    const weekStartDate = parseWeekStartDateInput(request.query.weekStart);

    if (categoryId) {
      assertCategoryAccess(access, categoryId);
    }

    const calendarItems = await listCalendarItems({
      weekStartDate,
      categoryId,
      includeCancelled,
      access,
      assignedOnly,
    });

    response.json(calendarItems);
  }),
);

schedulesRouter.post(
  "/:id/attendance-qr",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const occurrenceDate = parseOccurrenceDateInput(request.body.occurrenceDate);
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        categoryId: true,
        isWeeklyTemplate: true,
        isArchived: true,
        dayOfWeek: true,
        practiceType: true,
        startTime: true,
        endTime: true,
        notes: true,
        category: {
          select: {
            name: true,
          },
        },
        coaches: {
          select: {
            coachId: true,
          },
        },
      },
    });

    if (!schedule || schedule.isArchived) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, schedule.categoryId);
    assertOccurrenceDateMatchesSchedule(schedule, occurrenceDate);

    const now = new Date();
    const qrContext = await prisma.$transaction(async (transaction) => {
      const existingOccurrence = await transaction.scheduleOccurrence.findUnique({
        where: {
          scheduleId_occurrenceDate: {
            scheduleId,
            occurrenceDate,
          },
        },
        select: {
          id: true,
          occurrenceDate: true,
          startTime: true,
          endTime: true,
          isCancelled: true,
          coaches: {
            select: {
              coachId: true,
            },
          },
        },
      });

      assertPracticeAssignmentAccess(access, {
        scheduleCoachIds: schedule.coaches.map((assignment) => assignment.coachId),
        occurrenceCoachIds: existingOccurrence?.coaches.map((assignment) => assignment.coachId) ?? [],
      });

      if (existingOccurrence?.isCancelled) {
        throw new AppError("Za otkazani termin nije moguće otvoriti QR prijavu.", 400);
      }

      const occurrence =
        existingOccurrence ??
        (await transaction.scheduleOccurrence.create({
          data: buildOccurrenceCreateData(schedule, occurrenceDate, false),
          select: {
            id: true,
            occurrenceDate: true,
            startTime: true,
            endTime: true,
            isCancelled: true,
            coaches: {
              select: {
                coachId: true,
              },
            },
          },
        }));

      const activeSession = await transaction.attendanceQrSession.findFirst({
        where: {
          occurrenceId: occurrence.id,
          expiresAt: {
            gt: now,
          },
        },
        select: {
          id: true,
          token: true,
          expiresAt: true,
        },
        orderBy: {
          expiresAt: "desc",
        },
      });

      if (activeSession) {
        return {
          occurrence,
          qrSession: activeSession,
        };
      }

      const qrSession = await transaction.attendanceQrSession.create({
        data: {
          occurrenceId: occurrence.id,
          createdById: access.userId,
          token: randomBytes(18).toString("base64url"),
          expiresAt: new Date(now.getTime() + attendanceQrSessionLifetimeMs),
        },
        select: {
          id: true,
          token: true,
          expiresAt: true,
        },
      });

      return {
        occurrence,
        qrSession,
      };
    });

    response.json({
      sessionId: qrContext.qrSession.id,
      scheduleId,
      occurrenceId: qrContext.occurrence.id,
      occurrenceDate: getOccurrenceDateKey(qrContext.occurrence.occurrenceDate),
      categoryName: schedule.category.name,
      practiceType: schedule.practiceType,
      startTime:
        qrContext.occurrence.startTime?.toISOString() ??
        copyTimeOfDay(occurrenceDate, schedule.startTime).toISOString(),
      endTime:
        qrContext.occurrence.endTime?.toISOString() ??
        copyTimeOfDay(occurrenceDate, schedule.endTime).toISOString(),
      expiresAt: qrContext.qrSession.expiresAt.toISOString(),
      qrValue: `${attendanceQrTokenPrefix}${qrContext.qrSession.token}`,
    });
  }),
);

schedulesRouter.get(
  "/weekly-schedules",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const categoryId = typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;

    if (categoryId) {
      assertCategoryAccess(access, categoryId);
    }

    const weeklySchedules = await prisma.weeklySchedule.findMany({
      where: {
        ...(buildAccessibleCategoryWhere(access, categoryId) ?? {}),
      },
      include: weeklyScheduleInclude,
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });

    response.json(weeklySchedules);
  }),
);

schedulesRouter.post(
  "/weekly-schedules",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const payload = await parseWeeklySchedulePayload(request.body);
    assertCategoryAccess(access, payload.categoryId);

    const weeklySchedule = await prisma.$transaction(async (transaction) => {
      const createdWeeklySchedule = await transaction.weeklySchedule.create({
        data: {
          categoryId: payload.categoryId,
          name: payload.name,
          description: payload.description,
        },
        select: {
          id: true,
        },
      });

      for (const slot of payload.slots) {
        await createWeeklyScheduleSlot(transaction, createdWeeklySchedule.id, payload.categoryId, slot);
      }

      return transaction.weeklySchedule.findUnique({
        where: {
          id: createdWeeklySchedule.id,
        },
        include: weeklyScheduleInclude,
      });
    });

    response.status(201).json(weeklySchedule);
  }),
);

schedulesRouter.get(
  "/weekly-schedules/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const weeklyScheduleId = requireString(request.params.id, "id");
    const weeklySchedule = await prisma.weeklySchedule.findUnique({
      where: {
        id: weeklyScheduleId,
      },
      include: weeklyScheduleInclude,
    });

    if (!weeklySchedule) {
      throw new AppError("Tjedni raspored nije pronađen.", 404);
    }

    assertCategoryAccess(access, weeklySchedule.categoryId);
    response.json(weeklySchedule);
  }),
);

schedulesRouter.patch(
  "/weekly-schedules/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const weeklyScheduleId = requireString(request.params.id, "id");
    const existingWeeklySchedule = await prisma.weeklySchedule.findUnique({
      where: {
        id: weeklyScheduleId,
      },
      include: {
        schedules: {
          include: {
            coaches: {
              select: {
                coachId: true,
              },
            },
          },
        },
      },
    });

    if (!existingWeeklySchedule) {
      throw new AppError("Tjedni raspored nije pronađen.", 404);
    }

    assertCategoryAccess(access, existingWeeklySchedule.categoryId);
    const payload = await parseWeeklySchedulePayload(request.body, existingWeeklySchedule.categoryId);

    const updatedWeeklySchedule = await prisma.$transaction(async (transaction) => {
      await transaction.weeklySchedule.update({
        where: {
          id: weeklyScheduleId,
        },
        data: {
          name: payload.name,
          description: payload.description,
        },
      });

      await syncWeeklyScheduleSlots(transaction, {
        weeklyScheduleId,
        categoryId: existingWeeklySchedule.categoryId,
        existingSlots: existingWeeklySchedule.schedules,
        nextSlots: payload.slots,
      });

      return transaction.weeklySchedule.findUnique({
        where: {
          id: weeklyScheduleId,
        },
        include: weeklyScheduleInclude,
      });
    });

    response.json(updatedWeeklySchedule);

    if (updatedWeeklySchedule) {
      void notifyCategoryAudience(updatedWeeklySchedule.categoryId, {
        type: NotificationType.SCHEDULE_UPDATED,
        title: "Izmjena rasporeda",
        body: `Tjedni raspored "${updatedWeeklySchedule.name}" za kategoriju ${updatedWeeklySchedule.category.name} je ažuriran.`,
        data: {
          weeklyScheduleId: updatedWeeklySchedule.id,
          categoryId: updatedWeeklySchedule.categoryId,
        },
      });
    }
  }),
);

schedulesRouter.post(
  "/weekly-schedules/:id/activate",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const weeklyScheduleId = requireString(request.params.id, "id");
    const weekStartDate = parseWeekStartDateInput(request.body.weekStartDate);
    const existingWeeklySchedule = await prisma.weeklySchedule.findUnique({
      where: {
        id: weeklyScheduleId,
      },
      include: {
        schedules: {
          where: {
            isArchived: false,
          },
          include: {
            coaches: {
              select: {
                coachId: true,
              },
            },
          },
        },
      },
    });

    if (!existingWeeklySchedule) {
      throw new AppError("Tjedni raspored nije pronađen.", 404);
    }

    assertCategoryAccess(access, existingWeeklySchedule.categoryId);

    if (existingWeeklySchedule.schedules.length === 0) {
      throw new AppError("Tjedni raspored nema nijedan aktivni termin za aktivaciju.", 400);
    }

    const existingActivation = await prisma.weeklyScheduleActivation.findUnique({
      where: {
        weeklyScheduleId_weekStartDate: {
          weeklyScheduleId,
          weekStartDate,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingActivation) {
      throw new AppError("Odabrani tjedni raspored već je aktiviran za taj tjedan.", 400);
    }

    const activation = await prisma.$transaction(async (transaction) => {
      const createdActivation = await transaction.weeklyScheduleActivation.create({
        data: {
          weeklyScheduleId,
          weekStartDate,
          activatedById: access.userId,
        },
        select: {
          id: true,
        },
      });

      for (const slot of existingWeeklySchedule.schedules) {
        const occurrenceDate = buildOccurrenceDateForWeek(weekStartDate, slot.dayOfWeek ?? deriveDayOfWeek(slot.startTime));
        const startTime = copyTimeOfDay(occurrenceDate, slot.startTime);
        const endTime = copyTimeOfDay(occurrenceDate, slot.endTime);

        await transaction.scheduleOccurrence.create({
          data: {
            scheduleId: slot.id,
            activationId: createdActivation.id,
            occurrenceDate,
            practiceType: slot.practiceType,
            startTime,
            endTime,
            notes: slot.notes,
            coaches:
              slot.coaches.length > 0
                ? {
                    create: slot.coaches.map((assignment) => ({
                      coach: {
                        connect: {
                          id: assignment.coachId,
                        },
                      },
                    })),
                  }
                : undefined,
          },
        });
      }

      return transaction.weeklySchedule.findUnique({
        where: {
          id: weeklyScheduleId,
        },
        include: weeklyScheduleInclude,
      });
    });

    response.status(201).json(activation);
  }),
);

schedulesRouter.delete(
  "/weekly-schedules/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const weeklyScheduleId = requireString(request.params.id, "id");
    const existingWeeklySchedule = await prisma.weeklySchedule.findUnique({
      where: {
        id: weeklyScheduleId,
      },
      select: {
        id: true,
        categoryId: true,
      },
    });

    if (!existingWeeklySchedule) {
      throw new AppError("Tjedni raspored nije pronađen.", 404);
    }

    assertCategoryAccess(access, existingWeeklySchedule.categoryId);

    const occurrenceCount = await prisma.scheduleOccurrence.count({
      where: {
        schedule: {
          weeklyScheduleId,
        },
      },
    });

    if (occurrenceCount > 0) {
      throw new AppError(
        "Tjedni raspored koji već ima aktivirane stvarne termine nije moguće obrisati. Uredite ga ili prestanite koristiti za buduće tjedne.",
        400,
      );
    }

    await prisma.weeklySchedule.delete({
      where: {
        id: weeklyScheduleId,
      },
    });

    response.status(204).send();
  }),
);

schedulesRouter.get(
  "/",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const categoryId = typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;

    if (categoryId) {
      assertCategoryAccess(access, categoryId);
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        isArchived: false,
        ...(buildAccessibleCategoryWhere(access, categoryId) ?? {}),
      },
      include: scheduleInclude,
      orderBy: [{ isWeeklyTemplate: "desc" }, { startTime: "asc" }],
    });

    response.json(schedules);
  }),
);

schedulesRouter.post(
  "/",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const payload = await parseSpecialSchedulePayload(request.body);
    assertCategoryAccess(access, payload.categoryId);

    const schedule = await prisma.schedule.create({
      data: {
        categoryId: payload.categoryId,
        practiceType: payload.practiceType,
        startTime: payload.startTime,
        endTime: payload.endTime,
        notes: payload.notes,
        isWeeklyTemplate: false,
        weeklyScheduleId: null,
        dayOfWeek: null,
        coaches:
          payload.coachIds.length > 0
            ? {
                create: payload.coachIds.map((coachId) => ({
                  coach: {
                    connect: {
                      id: coachId,
                    },
                  },
                })),
              }
            : undefined,
      },
      include: scheduleInclude,
    });

    response.status(201).json(schedule);

    void notifyCategoryAudience(schedule.categoryId, {
      type: NotificationType.PRACTICE_CREATED,
      title: "Novi trening",
      body: `Dodan je novi trening za kategoriju ${schedule.category.name} — ${formatDateHr(
        schedule.startTime,
      )} u ${formatTimeRangeHr(schedule.startTime, schedule.endTime)}.`,
      data: { scheduleId: schedule.id, categoryId: schedule.categoryId },
    });
  }),
);

schedulesRouter.get(
  "/:id/attendance",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        categoryId: true,
        isWeeklyTemplate: true,
        isArchived: true,
        dayOfWeek: true,
        practiceType: true,
        startTime: true,
      },
    });

    if (!schedule || schedule.isArchived) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, schedule.categoryId);
    const occurrenceDate = parseOccurrenceDateInput(request.query.occurrenceDate);
    assertOccurrenceDateMatchesSchedule(schedule, occurrenceDate);

    const occurrence = await prisma.scheduleOccurrence.findUnique({
      where: {
        scheduleId_occurrenceDate: {
          scheduleId,
          occurrenceDate,
        },
      },
      select: {
        id: true,
        isCancelled: true,
        attendanceRecords: {
          select: {
            playerId: true,
          },
        },
      },
    });

    if (schedule.isWeeklyTemplate && !occurrence) {
      throw new AppError("Odabrani tjedni raspored nije aktiviran za taj tjedan.", 404);
    }

    response.json({
      scheduleId,
      occurrenceId: occurrence?.id ?? null,
      occurrenceDate: getOccurrenceDateKey(occurrenceDate),
      isCancelled: occurrence?.isCancelled ?? false,
      presentPlayerIds:
        occurrence?.attendanceRecords.map((record: { playerId: string }) => record.playerId) ?? [],
    });
  }),
);

schedulesRouter.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      include: scheduleInclude,
    });

    if (!schedule || schedule.isArchived) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, schedule.categoryId);
    response.json(schedule);
  }),
);

schedulesRouter.patch(
  "/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const existingSchedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        categoryId: true,
        isWeeklyTemplate: true,
        isArchived: true,
      },
    });

    if (!existingSchedule || existingSchedule.isArchived) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, existingSchedule.categoryId);

    if (existingSchedule.isWeeklyTemplate) {
      throw new AppError("Tjedni predložak uređuje se kroz njegov matični tjedni raspored.", 400);
    }

    const payload = await parseSpecialSchedulePayload(request.body, existingSchedule.categoryId);
    assertCategoryAccess(access, payload.categoryId);

    const schedule = await prisma.schedule.update({
      where: {
        id: scheduleId,
      },
      data: {
        categoryId: payload.categoryId,
        practiceType: payload.practiceType,
        startTime: payload.startTime,
        endTime: payload.endTime,
        notes: payload.notes,
        coaches: {
          deleteMany: {},
          create: payload.coachIds.map((coachId) => ({
            coach: {
              connect: {
                id: coachId,
              },
            },
          })),
        },
      },
      include: scheduleInclude,
    });

    response.json(schedule);

    void notifyCategoryAudience(schedule.categoryId, {
      type: NotificationType.PRACTICE_UPDATED,
      title: "Izmjena termina",
      body: `Trening za kategoriju ${schedule.category.name} je izmijenjen — ${formatDateHr(
        schedule.startTime,
      )} u ${formatTimeRangeHr(schedule.startTime, schedule.endTime)}.`,
      data: { scheduleId: schedule.id, categoryId: schedule.categoryId },
    });
  }),
);

schedulesRouter.put(
  "/:id/attendance",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        categoryId: true,
        isWeeklyTemplate: true,
        dayOfWeek: true,
        practiceType: true,
        startTime: true,
        endTime: true,
        notes: true,
        category: {
          select: {
            name: true,
          },
        },
        coaches: {
          select: {
            coachId: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, schedule.categoryId);
    const occurrenceDate = parseOccurrenceDateInput(request.body.occurrenceDate);
    const isCancelled = parseBooleanInput(request.body.isCancelled, "isCancelled");
    const presentPlayerIds = dedupeStringArray(parseStringArrayInput(request.body.presentPlayerIds));

    assertOccurrenceDateMatchesSchedule(schedule, occurrenceDate);

    const existingOccurrence = await prisma.scheduleOccurrence.findUnique({
      where: {
        scheduleId_occurrenceDate: {
          scheduleId,
          occurrenceDate,
        },
      },
      select: {
        id: true,
        isCancelled: true,
      },
    });

    if (schedule.isWeeklyTemplate && !existingOccurrence) {
      throw new AppError("Odabrani tjedni raspored nije aktiviran za taj tjedan.", 400);
    }

    if (!isCancelled && presentPlayerIds.length > 0) {
      const allowedPlayers = await prisma.player.findMany({
        where: {
          id: {
            in: presentPlayerIds,
          },
          categories: {
            some: {
              categoryId: schedule.categoryId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      if (allowedPlayers.length !== presentPlayerIds.length) {
        throw new AppError("Dolazak je moguće voditi samo za igrače iz odabrane kategorije.", 400);
      }
    }

    const occurrence = await prisma.$transaction(async (transaction) => {
      const savedOccurrence = await transaction.scheduleOccurrence.upsert({
        where: {
          scheduleId_occurrenceDate: {
            scheduleId,
            occurrenceDate,
          },
        },
        create: buildOccurrenceCreateData(schedule, occurrenceDate, isCancelled),
        update: {
          isCancelled,
        },
        select: {
          id: true,
          isCancelled: true,
        },
      });

      await transaction.scheduleAttendance.deleteMany({
        where: {
          occurrenceId: savedOccurrence.id,
        },
      });

      if (!isCancelled && presentPlayerIds.length > 0) {
        await transaction.scheduleAttendance.createMany({
          data: presentPlayerIds.map((playerId) => ({
            occurrenceId: savedOccurrence.id,
            playerId,
          })),
        });
      }

      return savedOccurrence;
    });

    response.json({
      scheduleId,
      occurrenceId: occurrence.id,
      occurrenceDate: getOccurrenceDateKey(occurrenceDate),
      isCancelled: occurrence.isCancelled,
      presentPlayerIds: isCancelled ? [] : presentPlayerIds,
    });

    if (occurrence.isCancelled && !existingOccurrence?.isCancelled) {
      void notifyCategoryAudience(schedule.categoryId, {
        type: NotificationType.PRACTICE_CANCELLED,
        title: "Trening otkazan",
        body: `Trening za kategoriju ${schedule.category.name} dana ${formatDateHr(
          occurrenceDate,
        )} je otkazan.`,
        data: {
          scheduleId,
          occurrenceId: occurrence.id,
          occurrenceDate: getOccurrenceDateKey(occurrenceDate),
        },
      });
    }
  }),
);

schedulesRouter.delete(
  "/:id",
  asyncHandler(async (request, response) => {
    const access = await getScheduleAccessContext(request);
    const scheduleId = requireString(request.params.id, "id");
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        categoryId: true,
        isWeeklyTemplate: true,
      },
    });

    if (!schedule) {
      throw new AppError("Termin nije pronađen.", 404);
    }

    assertCategoryAccess(access, schedule.categoryId);

    if (schedule.isWeeklyTemplate) {
      throw new AppError("Tjedni predložak briše se kroz njegov matični tjedni raspored.", 400);
    }

    await prisma.schedule.delete({
      where: {
        id: scheduleId,
      },
    });

    response.status(204).send();
  }),
);

async function getScheduleAccessContext(request: Express.Request): Promise<ScheduleAccessContext> {
  if (!request.auth) {
    throw new AppError("Autentikacija je obavezna.", 401);
  }

  if (request.auth.role === UserRole.ADMIN) {
    return {
      role: request.auth.role,
      userId: request.auth.userId,
      coachId: null,
      isConditioningCoach: false,
      categoryIds: null,
    };
  }

  const coach = await prisma.coach.findUnique({
    where: {
      userId: request.auth.userId,
    },
    select: {
      id: true,
      isConditioningCoach: true,
      categories: {
        select: {
          categoryId: true,
        },
      },
    },
  });

  if (!coach) {
    throw new AppError("Prijavljeni trener nema dodijeljen trenerski profil.", 403);
  }

  return {
    role: request.auth.role,
    userId: request.auth.userId,
    coachId: coach.id,
    isConditioningCoach: coach.isConditioningCoach,
    categoryIds: coach.categories.map((assignment) => assignment.categoryId),
  };
}

function assertCategoryAccess(access: ScheduleAccessContext, categoryId: string) {
  if (access.role === UserRole.ADMIN) {
    return;
  }

  if (!access.categoryIds?.includes(categoryId)) {
    throw new AppError("Nemate pristup rasporedima ove kategorije.", 403);
  }
}

function assertPracticeAssignmentAccess(
  access: ScheduleAccessContext,
  input: {
    scheduleCoachIds: string[];
    occurrenceCoachIds: string[];
  },
) {
  if (access.role !== UserRole.COACH || !access.coachId) {
    return;
  }

  const effectiveCoachIds =
    input.occurrenceCoachIds.length > 0 ? input.occurrenceCoachIds : input.scheduleCoachIds;

  if (!effectiveCoachIds.includes(access.coachId)) {
    throw new AppError("Možete otvoriti QR prijavu samo za treninge na koje ste dodijeljeni.", 403);
  }
}

function buildAccessibleCategoryWhere(access: ScheduleAccessContext, categoryId?: string) {
  if (access.role === UserRole.ADMIN) {
    return categoryId ? { categoryId } : undefined;
  }

  if (!access.categoryIds || access.categoryIds.length === 0) {
    return {
      categoryId: {
        in: [],
      },
    };
  }

  if (categoryId) {
    return {
      categoryId,
    };
  }

  return {
    categoryId: {
      in: access.categoryIds,
    },
  };
}

async function parseSpecialSchedulePayload(
  payload: unknown,
  existingCategoryId?: string,
): Promise<ParsedSpecialSchedulePayload> {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Podaci termina nisu ispravni.", 400);
  }

  const body = payload as Record<string, unknown>;
  const categoryId = existingCategoryId ?? requireString(body.categoryId, "categoryId");
  const startTime = parseDateInput(body.startTime, "startTime");
  const endTime = parseDateInput(body.endTime, "endTime");

  if (endTime <= startTime) {
    throw new AppError("Kraj termina mora biti nakon početka.", 400);
  }

  return {
    categoryId,
    practiceType: parsePracticeTypeInput(body.practiceType ?? PracticeType.WATER),
    startTime,
    endTime,
    notes: body.notes ? requireString(body.notes, "notes") : null,
    coachIds: await resolveScheduleCoachIds(
      categoryId,
      dedupeStringArray(parseStringArrayInput(body.coachIds)),
    ),
  };
}

async function parseWeeklySchedulePayload(
  payload: unknown,
  existingCategoryId?: string,
): Promise<ParsedWeeklySchedulePayload> {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Podaci tjednog rasporeda nisu ispravni.", 400);
  }

  const body = payload as Record<string, unknown>;
  const categoryId = existingCategoryId ?? requireString(body.categoryId, "categoryId");
  const slots = await parseWeeklyScheduleSlots(body.slots, categoryId);

  if (slots.length === 0) {
    throw new AppError("Dodajte barem jedan termin u tjedni raspored.", 400);
  }

  return {
    categoryId,
    name: requireString(body.name, "name"),
    description: body.description ? requireString(body.description, "description") : null,
    slots,
  };
}

async function parseWeeklyScheduleSlots(value: unknown, categoryId: string) {
  const entries = parseObjectArray(value, "slots");

  return Promise.all(
    entries.map(async (entry) => {
      const dayOfWeek = entry.dayOfWeek ? parseDayOfWeekInput(entry.dayOfWeek) : undefined;
      const startTime = parseDateInput(entry.startTime, "startTime");
      const endTime = parseDateInput(entry.endTime, "endTime");
      const resolvedDayOfWeek = dayOfWeek ?? deriveDayOfWeek(startTime);

      if (endTime <= startTime) {
        throw new AppError("Kraj termina mora biti nakon početka.", 400);
      }

      return {
        id: typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id.trim() : undefined,
        dayOfWeek: resolvedDayOfWeek,
        practiceType: parsePracticeTypeInput(entry.practiceType ?? PracticeType.WATER),
        startTime,
        endTime,
        notes: entry.notes ? requireString(entry.notes, "notes") : null,
        coachIds: await resolveScheduleCoachIds(
          categoryId,
          dedupeStringArray(parseStringArrayInput(entry.coachIds)),
        ),
      } satisfies ParsedWeeklyScheduleSlotPayload;
    }),
  );
}

async function createWeeklyScheduleSlot(
  transaction: Prisma.TransactionClient,
  weeklyScheduleId: string,
  categoryId: string,
  slot: ParsedWeeklyScheduleSlotPayload,
) {
  await transaction.schedule.create({
    data: {
      weeklyScheduleId,
      categoryId,
      practiceType: slot.practiceType,
      startTime: slot.startTime,
      endTime: slot.endTime,
      notes: slot.notes,
      isWeeklyTemplate: true,
      isArchived: false,
      dayOfWeek: slot.dayOfWeek,
      coaches:
        slot.coachIds.length > 0
          ? {
              create: slot.coachIds.map((coachId) => ({
                coach: {
                  connect: {
                    id: coachId,
                  },
                },
              })),
            }
          : undefined,
    },
  });
}

async function syncWeeklyScheduleSlots(
  transaction: Prisma.TransactionClient,
  input: {
    weeklyScheduleId: string;
    categoryId: string;
    existingSlots: Array<{
      id: string;
      isArchived: boolean;
    }>;
    nextSlots: ParsedWeeklyScheduleSlotPayload[];
  },
) {
  const nextSlotIds = new Set(input.nextSlots.map((slot) => slot.id).filter(Boolean) as string[]);
  const existingSlotMap = new Map(input.existingSlots.map((slot) => [slot.id, slot]));

  for (const existingSlot of input.existingSlots) {
    if (!existingSlot.isArchived && !nextSlotIds.has(existingSlot.id)) {
      await transaction.schedule.update({
        where: {
          id: existingSlot.id,
        },
        data: {
          isArchived: true,
        },
      });
    }
  }

  for (const slot of input.nextSlots) {
    if (slot.id) {
      const existingSlot = existingSlotMap.get(slot.id);

      if (!existingSlot) {
        throw new AppError("Jedan od termina više ne postoji u odabranom tjednom rasporedu.", 400);
      }

      await transaction.schedule.update({
        where: {
          id: slot.id,
        },
        data: {
          categoryId: input.categoryId,
          weeklyScheduleId: input.weeklyScheduleId,
          practiceType: slot.practiceType,
          startTime: slot.startTime,
          endTime: slot.endTime,
          notes: slot.notes,
          isWeeklyTemplate: true,
          isArchived: false,
          dayOfWeek: slot.dayOfWeek,
          coaches: {
            deleteMany: {},
            create: slot.coachIds.map((coachId) => ({
              coach: {
                connect: {
                  id: coachId,
                },
              },
            })),
          },
        },
      });

      continue;
    }

    await createWeeklyScheduleSlot(
      transaction,
      input.weeklyScheduleId,
      input.categoryId,
      slot,
    );
  }
}

export async function listCalendarItems(input: {
  weekStartDate: Date;
  categoryId?: string;
  includeCancelled: boolean;
  access?: ScheduleAccessContext;
  assignedOnly?: boolean;
}): Promise<CalendarItem[]> {
  const nextWeekStartDate = addUtcDays(input.weekStartDate, 7);
  const scheduleWhere = buildScheduleWhere(input.access, input.categoryId, Boolean(input.assignedOnly));
  const assignedCoachId =
    input.assignedOnly && input.access?.coachId ? input.access.coachId : undefined;

  const [weeklyOccurrences, specialSchedules] = await Promise.all([
    prisma.scheduleOccurrence.findMany({
      where: {
        occurrenceDate: {
          gte: input.weekStartDate,
          lt: nextWeekStartDate,
        },
        ...(input.includeCancelled ? {} : { isCancelled: false }),
        ...(assignedCoachId
          ? {
              coaches: {
                some: {
                  coachId: assignedCoachId,
                },
              },
            }
          : {}),
        schedule: {
          isWeeklyTemplate: true,
          isArchived: false,
          ...(scheduleWhere ?? {}),
        },
      },
      include: weeklyOccurrenceInclude,
      orderBy: [{ occurrenceDate: "asc" }, { startTime: "asc" }],
    }),
    prisma.schedule.findMany({
      where: {
        isWeeklyTemplate: false,
        isArchived: false,
        startTime: {
          gte: input.weekStartDate,
          lt: nextWeekStartDate,
        },
        ...(scheduleWhere ?? {}),
        ...(assignedCoachId
          ? {
              coaches: {
                some: {
                  coachId: assignedCoachId,
                },
              },
            }
          : {}),
      },
      include: {
        category: true,
        coaches: scheduleCoachInclude,
        occurrences: {
          where: {
            occurrenceDate: {
              gte: input.weekStartDate,
              lt: nextWeekStartDate,
            },
          },
          select: specialOccurrenceInclude,
        },
      },
      orderBy: {
        startTime: "asc",
      },
    }),
  ]);

  const items = [
    ...weeklyOccurrences.map((occurrence) => mapWeeklyOccurrenceToCalendarItem(occurrence)),
    ...specialSchedules
      .map((schedule) => mapSpecialScheduleToCalendarItem(schedule))
      .filter((item): item is CalendarItem => item !== null)
      .filter((item) => input.includeCancelled || !item.isCancelled),
  ];

  return items.sort((left, right) => {
    const startDifference =
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime();

    if (startDifference !== 0) {
      return startDifference;
    }

    return left.category.name.localeCompare(right.category.name, "hr-HR");
  });
}

function buildScheduleWhere(
  access?: ScheduleAccessContext,
  categoryId?: string,
  allowConditioningFallback = false,
) {
  if (!access) {
    return categoryId ? { categoryId } : undefined;
  }

  if (
    allowConditioningFallback &&
    access.role === UserRole.COACH &&
    access.isConditioningCoach &&
    !categoryId
  ) {
    return undefined;
  }

  return buildAccessibleCategoryWhere(access, categoryId);
}

function mapWeeklyOccurrenceToCalendarItem(
  occurrence: Prisma.ScheduleOccurrenceGetPayload<{
    include: typeof weeklyOccurrenceInclude;
  }>,
): CalendarItem {
  const schedule = occurrence.schedule;
  const coaches =
    occurrence.coaches.length > 0
      ? occurrence.coaches.map((assignment) => ({
          coachId: assignment.coachId,
          coach: assignment.coach,
        }))
      : schedule.coaches;
  const startTime = occurrence.startTime ?? copyTimeOfDay(occurrence.occurrenceDate, schedule.startTime);
  const endTime = occurrence.endTime ?? copyTimeOfDay(occurrence.occurrenceDate, schedule.endTime);

  return {
    id: occurrence.id,
    scheduleId: schedule.id,
    occurrenceId: occurrence.id,
    occurrenceDate: getOccurrenceDateKey(occurrence.occurrenceDate),
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    practiceType: occurrence.practiceType,
    notes: occurrence.notes ?? schedule.notes,
    isCancelled: occurrence.isCancelled,
    sourceType: "WEEKLY_TEMPLATE",
    weeklyScheduleId: schedule.weeklySchedule?.id ?? null,
    weeklyScheduleName: schedule.weeklySchedule?.name ?? null,
    category: schedule.category,
    coaches,
  };
}

function mapSpecialScheduleToCalendarItem(
  schedule: Prisma.ScheduleGetPayload<{
    include: {
      category: true;
      coaches: typeof scheduleCoachInclude;
      occurrences: {
        select: typeof specialOccurrenceInclude;
      };
    };
  }>,
): CalendarItem | null {
  const occurrence = schedule.occurrences[0] ?? null;

  if (occurrence?.isCancelled) {
    return {
      id: occurrence.id,
      scheduleId: schedule.id,
      occurrenceId: occurrence.id,
      occurrenceDate: getOccurrenceDateKey(occurrence.occurrenceDate),
      startTime: schedule.startTime.toISOString(),
      endTime: schedule.endTime.toISOString(),
      practiceType: occurrence.practiceType,
      notes: schedule.notes,
      isCancelled: true,
      sourceType: "SPECIAL_PRACTICE",
      weeklyScheduleId: null,
      weeklyScheduleName: null,
      category: schedule.category,
      coaches:
        occurrence.coaches.length > 0
          ? occurrence.coaches.map((assignment) => ({
              coachId: assignment.coachId,
              coach: assignment.coach,
            }))
          : schedule.coaches,
    };
  }

  return {
    id: occurrence?.id ?? `special-${schedule.id}`,
    scheduleId: schedule.id,
    occurrenceId: occurrence?.id ?? null,
    occurrenceDate: getOccurrenceDateKey(schedule.startTime),
    startTime: schedule.startTime.toISOString(),
    endTime: schedule.endTime.toISOString(),
    practiceType: schedule.practiceType,
    notes: schedule.notes,
    isCancelled: false,
    sourceType: "SPECIAL_PRACTICE",
    weeklyScheduleId: null,
    weeklyScheduleName: null,
    category: schedule.category,
    coaches: schedule.coaches,
  };
}

function buildOccurrenceCreateData(
  schedule: {
    id: string;
    practiceType: PracticeType;
    startTime: Date;
    endTime: Date;
    notes: string | null;
    coaches: Array<{ coachId: string }>;
  },
  occurrenceDate: Date,
  isCancelled: boolean,
) {
  return {
    scheduleId: schedule.id,
    occurrenceDate,
    isCancelled,
    practiceType: schedule.practiceType,
    startTime: copyTimeOfDay(occurrenceDate, schedule.startTime),
    endTime: copyTimeOfDay(occurrenceDate, schedule.endTime),
    notes: schedule.notes,
    coaches:
      schedule.coaches.length > 0
        ? {
            create: schedule.coaches.map((assignment) => ({
              coach: {
                connect: {
                  id: assignment.coachId,
                },
              },
            })),
          }
        : undefined,
  };
}

function parseObjectArray(value: unknown, fieldName: string) {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (!entry || typeof entry !== "object") {
        throw new AppError(`Svaka stavka u polju ${fieldName} mora biti objekt.`, 400);
      }

      return entry as Record<string, unknown>;
    });
  }

  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      throw new AppError(`Polje ${fieldName} mora biti poslano kao niz.`, 400);
    }

    return parsed.map((entry) => {
      if (!entry || typeof entry !== "object") {
        throw new AppError(`Svaka stavka u polju ${fieldName} mora biti objekt.`, 400);
      }

      return entry as Record<string, unknown>;
    });
  }

  throw new AppError(`Polje ${fieldName} mora biti poslano kao niz.`, 400);
}

export function parseWeekStartDateInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return getWeekStartDate(new Date());
  }

  const dateValue = requireString(value, "weekStartDate");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new AppError("Datum tjedna mora biti u formatu YYYY-MM-DD.", 400);
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  return getWeekStartDate(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0)));
}

function parseOccurrenceDateInput(value: unknown) {
  const dateValue = requireString(value, "occurrenceDate");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new AppError("Datum dolaska mora biti u formatu YYYY-MM-DD.", 400);
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0));
}

function assertOccurrenceDateMatchesSchedule(
  schedule: {
    isWeeklyTemplate: boolean;
    dayOfWeek: DayOfWeek | null;
    startTime: Date;
  },
  occurrenceDate: Date,
) {
  if (schedule.isWeeklyTemplate) {
    const expectedDay = schedule.dayOfWeek ?? deriveDayOfWeek(schedule.startTime);

    if (deriveDayOfWeek(occurrenceDate) !== expectedDay) {
      throw new AppError("Odabrani datum ne odgovara danu u tjednu ovog termina.", 400);
    }

    return;
  }

  if (getOccurrenceDateKey(schedule.startTime) !== getOccurrenceDateKey(occurrenceDate)) {
    throw new AppError("Za posebni termin moguće je voditi dolazak samo na dan termina.", 400);
  }
}

function getWeekStartDate(date: Date) {
  const normalized = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const day = normalized.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + offset);
  return normalized;
}

function buildOccurrenceDateForWeek(weekStartDate: Date, dayOfWeek: DayOfWeek) {
  const date = new Date(weekStartDate);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + getDayOffset(dayOfWeek));
  return date;
}

function copyTimeOfDay(targetDate: Date, referenceTime: Date) {
  return new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate(),
      referenceTime.getUTCHours(),
      referenceTime.getUTCMinutes(),
      referenceTime.getUTCSeconds(),
      referenceTime.getUTCMilliseconds(),
    ),
  );
}

function addUtcDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate;
}

function getDayOffset(dayOfWeek: DayOfWeek) {
  const mapping: Record<DayOfWeek, number> = {
    [DayOfWeek.MONDAY]: 0,
    [DayOfWeek.TUESDAY]: 1,
    [DayOfWeek.WEDNESDAY]: 2,
    [DayOfWeek.THURSDAY]: 3,
    [DayOfWeek.FRIDAY]: 4,
    [DayOfWeek.SATURDAY]: 5,
    [DayOfWeek.SUNDAY]: 6,
  };

  return mapping[dayOfWeek];
}

function getOccurrenceDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function dedupeStringArray(values: string[]) {
  return Array.from(new Set(values));
}
