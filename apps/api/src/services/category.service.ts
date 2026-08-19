import { DayOfWeek } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function suggestCategoryIdForDateOfBirth(dateOfBirth: Date): Promise<string | null> {
  const categories = await prisma.category.findMany({
    orderBy: [{ startDateOfBirth: "desc" }, { endDateOfBirth: "asc" }],
    select: {
      id: true,
      startDateOfBirth: true,
      endDateOfBirth: true,
    },
  });

  if (!categories.length) {
    return null;
  }

  const youthMatch = categories.find(
    (category) => category.startDateOfBirth && dateOfBirth >= category.startDateOfBirth,
  );
  const veteranMatch = categories.find(
    (category) => category.endDateOfBirth && dateOfBirth <= category.endDateOfBirth,
  );

  return (
    youthMatch?.id ??
    veteranMatch?.id ??
    categories.find((category) => !category.startDateOfBirth && !category.endDateOfBirth)?.id ??
    null
  );
}

export async function resolveScheduleCoachIds(
  categoryId: string | null,
  providedCoachIds: string[],
): Promise<string[]> {
  if (providedCoachIds.length > 0) {
    return providedCoachIds;
  }

  if (!categoryId) {
    return [];
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
