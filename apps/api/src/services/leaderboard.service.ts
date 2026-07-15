import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { PaginationInput } from "../utils/request-parsers";

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  firstName: string;
  lastName: string;
  categoryNames: string[];
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
  return computeCategoriesLeaderboard([categoryId], window, pagination, categoryId);
}

export async function computeCategoriesLeaderboard(
  categoryIds: string[],
  window: LeaderboardWindow = {},
  pagination?: PaginationInput,
  resultCategoryId = "all",
): Promise<CategoryLeaderboard> {
  const uniqueCategoryIds = [...new Set(categoryIds)].filter(Boolean);
  const now = new Date();
  // Never count occurrences that have not happened yet, even inside a window that reaches into the
  // future (e.g. "this week").
  const upperBound = window.to && window.to < now ? window.to : now;

  const occurrenceDateFilter = {
    ...(window.from ? { gte: window.from } : {}),
    lte: upperBound,
  };

  const page = pagination?.page ?? 1;

  if (uniqueCategoryIds.length === 0) {
    const pageSize = pagination?.pageSize ?? 1;

    return {
      categoryId: resultCategoryId,
      from: window.from ? window.from.toISOString().slice(0, 10) : null,
      to: upperBound.toISOString().slice(0, 10),
      total: 0,
      totalEntries: 0,
      page,
      pageSize,
      totalPages: 1,
      entries: [],
    };
  }

  const [total, totalEntries] = await Promise.all([
    prisma.scheduleOccurrence.count({
      where: {
        isCancelled: false,
        occurrenceDate: occurrenceDateFilter,
        schedule: {
          categoryId: { in: uniqueCategoryIds },
        },
      },
    }),
    prisma.player.count({
      where: {
        categories: {
          some: {
            categoryId: { in: uniqueCategoryIds },
          },
        },
      },
    }),
  ]);
  const pageSize = pagination?.pageSize ?? (totalEntries || 1);
  const skip = pagination?.skip ?? 0;
  const take = pagination?.take ?? (totalEntries || 1);
  const fromClause = window.from
    ? Prisma.sql`AND so."occurrenceDate" >= ${window.from}`
    : Prisma.empty;
  const categoryIdList = Prisma.join(uniqueCategoryIds);
  const rows = await prisma.$queryRaw<LeaderboardEntry[]>`
    WITH player_category_scope AS (
      SELECT DISTINCT pc."playerId", pc."categoryId"
      FROM player_categories pc
      WHERE pc."categoryId" IN (${categoryIdList})
    ),
    practice_totals AS (
      SELECT pcs."playerId", COUNT(DISTINCT so.id)::int AS total
      FROM player_category_scope pcs
      JOIN schedules s ON s."categoryId" = pcs."categoryId"
      JOIN schedule_occurrences so ON so."scheduleId" = s.id
      WHERE so."isCancelled" = false
        AND so."occurrenceDate" <= ${upperBound}
        ${fromClause}
      GROUP BY pcs."playerId"
    ),
    attendance_counts AS (
      SELECT sa."playerId", COUNT(DISTINCT sa."occurrenceId")::int AS attended
      FROM schedule_attendance sa
      JOIN schedule_occurrences so ON so.id = sa."occurrenceId"
      JOIN schedules s ON s.id = so."scheduleId"
      JOIN player_category_scope pcs
        ON pcs."playerId" = sa."playerId"
       AND pcs."categoryId" = s."categoryId"
      WHERE so."isCancelled" = false
        AND so."occurrenceDate" <= ${upperBound}
        ${fromClause}
      GROUP BY sa."playerId"
    ),
    ranked AS (
      SELECT
        RANK() OVER (ORDER BY COALESCE(ac.attended, 0) DESC)::int AS rank,
        p.id AS "playerId",
        u."firstName",
        u."lastName",
        COALESCE(
          ARRAY_AGG(DISTINCT c.name ORDER BY c.name)
            FILTER (WHERE c.name IS NOT NULL),
          ARRAY[]::text[]
        ) AS "categoryNames",
        u."profileImageUrl",
        COALESCE(ac.attended, 0)::int AS attended,
        COALESCE(pt.total, 0)::int AS total,
        CASE
          WHEN COALESCE(pt.total, 0)::int > 0
            THEN ROUND((COALESCE(ac.attended, 0)::numeric / COALESCE(pt.total, 0)::numeric) * 100)::int
          ELSE 0
        END AS percentage
      FROM (SELECT DISTINCT "playerId" FROM player_category_scope) eligible_players
      JOIN players p ON p.id = eligible_players."playerId"
      JOIN users u ON u.id = p."userId"
      JOIN player_category_scope pcs ON pcs."playerId" = p.id
      JOIN categories c ON c.id = pcs."categoryId"
      LEFT JOIN attendance_counts ac ON ac."playerId" = p.id
      LEFT JOIN practice_totals pt ON pt."playerId" = p.id
      GROUP BY p.id, u."firstName", u."lastName", u."profileImageUrl", ac.attended, pt.total
    )
    SELECT rank, "playerId", "firstName", "lastName", "categoryNames", "profileImageUrl", attended, total, percentage
    FROM ranked
    ORDER BY rank ASC, "lastName" ASC, "firstName" ASC, "playerId" ASC
    OFFSET ${skip}
    LIMIT ${take}
  `;

  return {
    categoryId: resultCategoryId,
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
