import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { PaginationInput } from "../utils/request-parsers";

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  attended: number;
  total: number;
  percentage: number;
}

export interface LeaderboardWindow {
  from?: Date;
  to?: Date;
}

export interface CategoryLeaderboard {
  categoryId: string;
  from: string | null;
  to: string;
  total: number;
  totalEntries: number;
  page: number;
  pageSize: number;
  totalPages: number;
  entries: LeaderboardEntry[];
}

/**
 * Ranks the players of a category by number of practices attended within an optional date window.
 * The denominator (`total`) is the count of non-cancelled occurrences in the window whose date has
 * already passed, so future occurrences never dilute the score. Players with zero attendance are
 * still included so the whole squad appears on the board.
 */
export async function computeCategoryLeaderboard(
  categoryId: string,
  window: LeaderboardWindow = {},
  pagination?: PaginationInput,
): Promise<CategoryLeaderboard> {
  const now = new Date();
  // Never count occurrences that have not happened yet, even inside a window that reaches into the
  // future (e.g. "this week").
  const upperBound = window.to && window.to < now ? window.to : now;

  const occurrenceDateFilter = {
    ...(window.from ? { gte: window.from } : {}),
    lte: upperBound,
  };

  const page = pagination?.page ?? 1;
  const [total, totalEntries] = await Promise.all([
    prisma.scheduleOccurrence.count({
      where: {
        isCancelled: false,
        occurrenceDate: occurrenceDateFilter,
        schedule: {
          categoryId,
        },
      },
    }),
    prisma.playerCategory.count({ where: { categoryId } }),
  ]);
  const pageSize = pagination?.pageSize ?? (totalEntries || 1);
  const skip = pagination?.skip ?? 0;
  const take = pagination?.take ?? (totalEntries || 1);
  const fromClause = window.from
    ? Prisma.sql`AND so."occurrenceDate" >= ${window.from}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<LeaderboardEntry[]>`
    WITH attendance_counts AS (
      SELECT sa."playerId", COUNT(sa."playerId")::int AS attended
      FROM schedule_attendance sa
      JOIN schedule_occurrences so ON so.id = sa."occurrenceId"
      JOIN schedules s ON s.id = so."scheduleId"
      WHERE so."isCancelled" = false
        AND so."occurrenceDate" <= ${upperBound}
        ${fromClause}
        AND s."categoryId" = ${categoryId}
      GROUP BY sa."playerId"
    ),
    ranked AS (
      SELECT
        RANK() OVER (ORDER BY COALESCE(ac.attended, 0) DESC)::int AS rank,
        p.id AS "playerId",
        u."firstName",
        u."lastName",
        u."profileImageUrl",
        COALESCE(ac.attended, 0)::int AS attended,
        ${total}::int AS total,
        CASE
          WHEN ${total}::int > 0 THEN ROUND((COALESCE(ac.attended, 0)::numeric / ${total}::numeric) * 100)::int
          ELSE 0
        END AS percentage
      FROM player_categories pc
      JOIN players p ON p.id = pc."playerId"
      JOIN users u ON u.id = p."userId"
      LEFT JOIN attendance_counts ac ON ac."playerId" = p.id
      WHERE pc."categoryId" = ${categoryId}
    )
    SELECT rank, "playerId", "firstName", "lastName", "profileImageUrl", attended, total, percentage
    FROM ranked
    ORDER BY rank ASC, "lastName" ASC, "firstName" ASC, "playerId" ASC
    OFFSET ${skip}
    LIMIT ${take}
  `;

  return {
    categoryId,
    from: window.from ? window.from.toISOString().slice(0, 10) : null,
    to: upperBound.toISOString().slice(0, 10),
    total,
    totalEntries,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalEntries / pageSize)),
    entries: rows,
  };
}
