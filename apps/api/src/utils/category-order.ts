import { Prisma } from "@prisma/client";

/**
 * Categories are listed youngest to oldest: the later the birth date range
 * starts, the younger the players it covers.
 */
export const categoryOrderBy: Prisma.CategoryOrderByWithRelationInput[] = [
  { startDateOfBirth: "desc" },
  { endDateOfBirth: "asc" },
  { name: "asc" },
];

/** The same ordering for relations that nest a category, e.g. coach assignments. */
export const nestedCategoryOrderBy = categoryOrderBy.map((order) => ({ category: order }));
