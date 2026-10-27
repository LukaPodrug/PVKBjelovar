import { CategoryKind, ProgramAudience } from "@prisma/client";
import { prisma } from "../lib/prisma";

interface PricedCategory {
  kind: CategoryKind;
  audience: ProgramAudience;
  monthlyPriceCents: number | null;
  membershipFreeUntil: Date | null;
}

/** The club fee and its free period, from Postavke. */
export interface ClubMembershipPricing {
  priceCents: number | null;
  freeUntil: Date | null;
  siblingPriceCents: number | null;
}

export interface MembershipPrice {
  /** What the player pays outside any free period: individual price, else the suggestion. */
  priceCents: number | null;
  /** Category or program fee the player would pay without an individual price. */
  suggestedPriceCents: number | null;
  /** Set while membership is free (YYYY-MM-DD, last free day); null when it is paid. */
  freeUntil: string | null;
}

/**
 * The categories that set a player's fee: waterpolo categories for waterpolo players (a kid who is
 * also in a program pays as a waterpolo player), otherwise member programs.
 */
function getPricingCategories(categories: PricedCategory[]) {
  const regular = categories.filter((category) => category.kind === CategoryKind.REGULAR);

  if (regular.length > 0) {
    return regular;
  }

  return categories.filter(
    (category) => category.kind === CategoryKind.PROGRAM && category.audience === ProgramAudience.MEMBERS,
  );
}

/**
 * A player's monthly fee. Each category charges its own monthly price or the club fee; with several,
 * the highest applies. A category on the club fee also follows the club's free period unless it set
 * its own. Membership is free while every pricing category is inside its free period, and that also
 * overrides individual prices (e.g. a sibling discount only starts once the promotion ends).
 */
export function resolveMembershipPrice(
  player: {
    membershipPriceCents: number | null;
    categories: Array<{ category: PricedCategory }>;
  },
  club: ClubMembershipPricing,
  now = new Date(),
): MembershipPrice {
  const pricingCategories = getPricingCategories(player.categories.map((assignment) => assignment.category));
  const categoryPrices = pricingCategories
    .map((category) => category.monthlyPriceCents ?? club.priceCents)
    .filter((price): price is number => price !== null);
  const suggestedPriceCents = categoryPrices.length > 0 ? Math.max(...categoryPrices) : club.priceCents;

  const today = toClubDate(now);
  const freeUntilDates = pricingCategories.map((category) => {
    const freeUntil =
      category.membershipFreeUntil ?? (category.monthlyPriceCents === null ? club.freeUntil : null);
    return freeUntil ? freeUntil.toISOString().slice(0, 10) : null;
  });
  const isFree =
    freeUntilDates.length > 0 &&
    freeUntilDates.every((freeUntil) => freeUntil !== null && today <= freeUntil);

  return {
    priceCents: player.membershipPriceCents ?? suggestedPriceCents,
    suggestedPriceCents,
    // With several free categories, membership becomes paid as soon as the first one ends.
    freeUntil: isFree ? [...(freeUntilDates as string[])].sort()[0]! : null,
  };
}

/** The amount parents are asked to pay right now: nothing during a free period. */
export function getCurrentMembershipPriceCents(price: MembershipPrice) {
  return price.freeUntil ? 0 : price.priceCents;
}

export async function getClubMembershipPricing(): Promise<ClubMembershipPricing> {
  const settings = await prisma.clubSettings.findUnique({
    where: { id: "club-settings" },
    select: { membershipPriceCents: true, membershipFreeUntil: true, siblingMembershipPriceCents: true },
  });

  return {
    priceCents: settings?.membershipPriceCents ?? null,
    freeUntil: settings?.membershipFreeUntil ?? null,
    siblingPriceCents: settings?.siblingMembershipPriceCents ?? null,
  };
}

/**
 * Fee for the second and every further child of a family joining this category or program: its own
 * sibling fee, else the club sibling fee when it charges the club fee. A category with its own fee
 * and no sibling fee gives no discount (null).
 */
export function getSiblingPriceCents(
  category: { monthlyPriceCents: number | null; siblingPriceCents: number | null },
  club: ClubMembershipPricing,
) {
  return category.siblingPriceCents ?? (category.monthlyPriceCents === null ? club.siblingPriceCents : null);
}

/** Adds the suggested fee and free period to a player loaded with its categories, for admin. */
export function withSuggestedMembershipPrice<
  T extends { membershipPriceCents: number | null; categories: Array<{ category: PricedCategory }> },
>(player: T, club: ClubMembershipPricing) {
  const price = resolveMembershipPrice(player, club);

  return {
    ...player,
    suggestedMembershipPriceCents: price.suggestedPriceCents,
    membershipFreeUntil: price.freeUntil,
  };
}

function toClubDate(instant: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
