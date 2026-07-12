import { DayOfWeek } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function suggestCategoryIdForDateOfBirth(dateOfBirth: Date): Promise<string | null> {
  const categories = await prisma.category.findMany({
    orderBy: {
      endDateOfBirth: "asc",
    },
    select: {
      id: true,
      endDateOfBirth: true,
    },
  });

  if (!categories.length) {
    return null;
  }

  const exactMatch = categories.find((category) => dateOfBirth <= category.endDateOfBirth);

  return exactMatch?.id ?? categories[categories.length - 1]?.id ?? null;
}

export async function resolveScheduleCoachIds(
  categoryId: string,
  providedCoachIds: string[],
): Promise<string[]> {
  if (providedCoachIds.length > 0) {
    return providedCoachIds;
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      coaches: {
        select: {
          coachId: true,
        },
      },
    },
  });

  return category?.coaches.map((entry) => entry.coachId) ?? [];
}

export function deriveDayOfWeek(date: Date): DayOfWeek {
  const value = date.getUTCDay();

  if (value === 0) {
    return DayOfWeek.SUNDAY;
  }

  const mapping: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];

  return mapping[value - 1] ?? DayOfWeek.MONDAY;
}
