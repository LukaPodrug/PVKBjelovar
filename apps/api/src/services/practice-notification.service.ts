import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatTimeRangeHr } from "../utils/datetime";
import { dispatchNotificationToUsers } from "./notification.service";

const startedPracticeLookbackMs = 24 * 60 * 60 * 1000;

export async function notifyAbsentPlayersForStartedPractice(
  occurrenceId: string,
  referenceDate = new Date(),
): Promise<number> {
  try {
    const occurrence = await prisma.scheduleOccurrence.findUnique({
      where: {
        id: occurrenceId,
      },
      select: {
        id: true,
        occurrenceDate: true,
        startTime: true,
        endTime: true,
        isCancelled: true,
        schedule: {
          select: {
            id: true,
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
        attendanceRecords: {
          select: {
            playerId: true,
          },
        },
      },
    });

    if (!occurrence || occurrence.isCancelled) {
      return 0;
    }

    const practiceStartTime =
      occurrence.startTime ?? copyTimeOfDay(occurrence.occurrenceDate, occurrence.schedule.startTime);

    if (referenceDate < practiceStartTime) {
      return 0;
    }

    const presentPlayerIds = new Set(occurrence.attendanceRecords.map((record) => record.playerId));
    const absentPlayers = await prisma.player.findMany({
      where: {
        ...(occurrence.schedule.categoryId
          ? {
              categories: {
                some: {
                  categoryId: occurrence.schedule.categoryId,
                },
              },
            }
          : {}),
        id: {
          notIn: Array.from(presentPlayerIds),
        },
        user: {
          accountStatus: "ACTIVE",
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        parents: {
          select: {
            parent: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const occurrenceDateKey = getOccurrenceDateKey(occurrence.occurrenceDate);
    const categoryName = occurrence.schedule.category?.name ?? "sve kategorije";
    const practiceEndTime =
      occurrence.endTime ?? copyTimeOfDay(occurrence.occurrenceDate, occurrence.schedule.endTime);

    for (const player of absentPlayers) {
      const playerName = `${player.user.firstName} ${player.user.lastName}`;
      const targetUserIds = [
        player.userId,
        ...player.parents.map((link) => link.parent.userId),
      ];

      await dispatchNotificationToUsers(targetUserIds, {
        type: NotificationType.PRACTICE_ABSENCE,
        title: "Nedolazak na trening",
        body: `${playerName} nije evidentiran/a na treningu za ${categoryName} koji je počeo u ${formatTimeRangeHr(
          practiceStartTime,
          practiceEndTime,
        )}.`,
        dedupeKey: `practice-absence:${occurrence.id}:${player.id}`,
        data: {
          scheduleId: occurrence.schedule.id,
          occurrenceId: occurrence.id,
          occurrenceDate: occurrenceDateKey,
          playerId: player.id,
          categoryId: occurrence.schedule.categoryId,
        },
      });
    }

    return absentPlayers.length;
  } catch (error) {
    console.error("Failed to notify absent players", error);
    return 0;
  }
}

export async function notifyAbsencesForRecentlyStartedPractices(
  referenceDate = new Date(),
): Promise<number> {
  const windowStart = new Date(referenceDate.getTime() - startedPracticeLookbackMs);
  const occurrenceIds = new Set<string>();
  const [occurrences, specialSchedules] = await Promise.all([
    prisma.scheduleOccurrence.findMany({
      where: {
        isCancelled: false,
        startTime: {
          gte: windowStart,
          lte: referenceDate,
        },
      },
      select: {
        id: true,
      },
    }),
    prisma.schedule.findMany({
      where: {
        isWeeklyTemplate: false,
        isArchived: false,
        startTime: {
          gte: windowStart,
          lte: referenceDate,
        },
      },
      select: {
        id: true,
        practiceType: true,
        startTime: true,
        endTime: true,
        notes: true,
        coaches: {
          select: {
            coachId: true,
          },
        },
        occurrences: {
          select: {
            id: true,
            occurrenceDate: true,
            isCancelled: true,
          },
        },
      },
    }),
  ]);

  occurrences.forEach((occurrence) => occurrenceIds.add(occurrence.id));

  for (const schedule of specialSchedules) {
    const occurrenceDate = getOccurrenceDate(schedule.startTime);
    const existingOccurrence = schedule.occurrences.find(
      (occurrence) => getOccurrenceDateKey(occurrence.occurrenceDate) === getOccurrenceDateKey(occurrenceDate),
    );

    if (existingOccurrence?.isCancelled) {
      continue;
    }

    if (existingOccurrence) {
      occurrenceIds.add(existingOccurrence.id);
      continue;
    }

    const occurrence = await prisma.scheduleOccurrence.create({
      data: {
        scheduleId: schedule.id,
        occurrenceDate,
        isCancelled: false,
        practiceType: schedule.practiceType,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
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
      },
      select: {
        id: true,
      },
    });
    occurrenceIds.add(occurrence.id);
  }

  let processedPlayers = 0;

  for (const occurrenceId of occurrenceIds) {
    processedPlayers += await notifyAbsentPlayersForStartedPractice(occurrenceId, referenceDate);
  }

  return processedPlayers;
}

function getOccurrenceDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0, 0));
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

function getOccurrenceDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}
