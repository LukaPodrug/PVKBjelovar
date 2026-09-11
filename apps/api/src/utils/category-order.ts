import { Prisma } from "@prisma/client";

/**
 * Categories are listed youth first (youngest squad first), then the senior squad, then veterans
 * (again youngest first).
 *
 * A category carries either a lower bound (startDateOfBirth, "godište od" — youth), an upper bound
 * (endDateOfBirth, "godište do" — a minimum-age veteran band), or neither (seniors). Youth sort
 * ahead of everything else on a non-null lower bound, latest first. Within the rest, a null upper
 * bound sorts first so the unlimited senior squad sits between youth and veterans, and the veteran
 * bands follow with the latest cut-off — the youngest band — first.
 */
export const categoryOrderBy: Prisma.CategoryOrderByWithRelationInput[] = [
  { startDateOfBirth: { sort: "desc", nulls: "last" } },
  { endDateOfBirth: { sort: "desc", nulls: "first" } },
  { name: "asc" },
];

/** The same ordering for relations that nest a category, e.g. coach assignments. */
export const nestedCategoryOrderBy = categoryOrderBy.map((order) => ({ category: order }));
