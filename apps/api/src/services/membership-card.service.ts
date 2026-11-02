import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";
import { getClubMembershipPricing, resolveMembershipPrice } from "./membership-price.service";

/**
 * ACTIVE: paid up to validUntil. FREE: inside a free period ending on validUntil. EXPIRED: the last
 * paid period has ended. NONE: no membership recorded yet.
 */
export type MembershipCardStatus = "ACTIVE" | "FREE" | "EXPIRED" | "NONE";

/**
 * The data shown on a player's virtual membership card in the mobile app, for the player
 * themselves or a parent showing their child's card.
 */
export async function buildMembershipCard(playerId: string, now = new Date()) {
  const [player, settings, clubPricing] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        dateOfBirth: true,
        membershipExpiresAt: true,
        membershipPriceCents: true,
        archivedAt: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
        categories: {
          orderBy: { category: { name: "asc" } },
          select: {
            category: {
              select: {
                name: true,
                kind: true,
                audience: true,
                monthlyPriceCents: true,
                membershipFreeUntil: true,
              },
            },
          },
        },
      },
    }),
    prisma.clubSettings.findUnique({ where: { id: "club-settings" } }),
    getClubMembershipPricing(),
  ]);

  if (!player || player.archivedAt) {
    throw new AppError("Igrač nije pronađen.", 404);
  }

  // Dates are compared as club days (Zagreb), the way admins enter them.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const paidUntil = player.membershipExpiresAt?.toISOString().slice(0, 10) ?? null;
  const { freeUntil } = resolveMembershipPrice(player, clubPricing, now);
  let status: MembershipCardStatus = "NONE";
  let validUntil: string | null = paidUntil;

  if (paidUntil && paidUntil >= today) {
    status = "ACTIVE";
  } else if (freeUntil) {
    status = "FREE";
    validUntil = freeUntil;
  } else if (paidUntil) {
    status = "EXPIRED";
  }

  return {
    playerId: player.id,
    // Short, stable number printed on the card: joining year plus the end of the player's id.
    memberNumber: `${player.createdAt.getUTCFullYear()}-${player.id.slice(-6).toUpperCase()}`,
    firstName: player.user.firstName,
    lastName: player.user.lastName,
    profileImageUrl: player.user.profileImageUrl,
    dateOfBirth: player.dateOfBirth.toISOString().slice(0, 10),
    categories: player.categories.map((assignment) => assignment.category.name),
    memberSince: player.createdAt.toISOString().slice(0, 10),
    status,
    validUntil,
    club: {
      name: settings?.clubName ?? null,
      subtitle: settings?.clubSubtitle ?? null,
      logoUrl: settings?.logoUrl ?? null,
    },
  };
}
