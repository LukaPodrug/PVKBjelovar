import { CategoryKind, ProgramAudience } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface PricedCategory {
  kind: CategoryKind;
  audience: ProgramAudience;
  monthlyPriceCents: number | null;
}

/**
 * The monthly fee a player would pay without an individual price: waterpolo players pay the club
 * membership fee, and kids who are only in member programs (e.g. pool games) pay that program's
 * monthly fee. A kid in both is a waterpolo player, so the club fee wins.
 */
export function suggestMembershipPriceCents(
  categories: PricedCategory[],
  clubMembershipPriceCents: number | null,
) {
  const isWaterpoloPlayer = categories.some((category) => category.kind === CategoryKind.REGULAR);
  const programPrices = categories
    .filter(
      (category) =>
        category.kind === CategoryKind.PROGRAM &&
        category.audience === ProgramAudience.MEMBERS &&
        category.monthlyPriceCents !== null,
    )
    .map((category) => category.monthlyPriceCents!);

  if (isWaterpoloPlayer || programPrices.length === 0) {
    return clubMembershipPriceCents;
  }

  return Math.max(...programPrices);
}

/** The fee parents are asked to pay: the admin's individual price first, then the suggestion. */
export function resolveMembershipPriceCents(
  player: { membershipPriceCents: number | null; categories: Array<{ category: PricedCategory }> },
  clubMembershipPriceCents: number | null,
) {
  return (
    player.membershipPriceCents ??
    suggestMembershipPriceCents(
      player.categories.map((assignment) => assignment.category),
      clubMembershipPriceCents,
    )
  );
}

export async function getClubMembershipPriceCents() {
  const settings = await prisma.clubSettings.findUnique({
    where: { id: "club-settings" },
    select: { membershipPriceCents: true },
  });

  return settings?.membershipPriceCents ?? null;
}

/** Adds the suggested fee to a player loaded with its categories, for the admin player editor. */
export function withSuggestedMembershipPrice<
  T extends { categories: Array<{ category: PricedCategory }> },
>(player: T, clubMembershipPriceCents: number | null) {
  return {
    ...player,
    suggestedMembershipPriceCents: suggestMembershipPriceCents(
      player.categories.map((assignment) => assignment.category),
      clubMembershipPriceCents,
    ),
  };
}
