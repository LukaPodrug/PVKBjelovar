import { Prisma } from "@prisma/client";

/**
 * Categories are listed youngest to oldest.
 *
 * A category carries either a lower bound (startDateOfBirth, "godište od" — youth) or an upper
 * bound (endDateOfBirth, "godište do" — veterans and, in practice, every age-capped squad), never
 * both. A later bound of either kind means younger players, so both sort descending. Nulls sort
 * last so an unbounded senior squad ends up at the bottom rather than the top.
 */
export const categoryOrderBy: Prisma.CategoryOrderByWithRelationInput[] = [
  { startDateOfBirth: { sort: "desc", nulls: "last" } },
  { endDateOfBirth: { sort: "desc", nulls: "last" } },
  { name: "asc" },
];

/** The same ordering for relations that nest a category, e.g. coach assignments. */
export const nestedCategoryOrderBy = categoryOrderBy.map((order) => ({ category: order }));
