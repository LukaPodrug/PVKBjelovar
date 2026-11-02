import { AccountStatus, Prisma, UserRole } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { prisma } from "../lib/prisma";

type ProfileRole = Exclude<UserRole, typeof UserRole.ADMIN>;
type ProfileClient = Prisma.TransactionClient | typeof prisma;

const profileSelect = {
  id: true,
  role: true,
  coach: { select: { id: true } },
  parent: { select: { id: true } },
  player: { select: { id: true, archivedAt: true } },
} as const;

type UserWithProfiles = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

/**
 * Every role a user can act as. One account can hold a coach, parent and player profile at once
 * (e.g. a coach who also plays for the veterans), so the stored role is only the primary one. A
 * deleted (archived) player profile no longer counts, unless it is the account's only one: such an
 * account is suspended anyway.
 */
export function listUserProfiles(user: UserWithProfiles): UserRole[] {
  const profiles = new Set<UserRole>([user.role]);

  if (user.coach) {
    profiles.add(UserRole.COACH);
  }

  if (user.parent) {
    profiles.add(UserRole.PARENT);
  }

  if (user.player && !user.player.archivedAt) {
    profiles.add(UserRole.PLAYER);
  }

  return [...profiles];
}

export async function findUserProfiles(userId: string, client: ProfileClient = prisma) {
  const user = await client.user.findUnique({ where: { id: userId }, select: profileSelect });

  return user ? listUserProfiles(user) : [];
}

function remainingProfileRole(user: UserWithProfiles, removed: ProfileRole): UserRole | null {
  if (user.role === UserRole.ADMIN) {
    return UserRole.ADMIN;
  }

  const candidates: [UserRole, boolean][] = [
    [UserRole.COACH, Boolean(user.coach) && removed !== UserRole.COACH],
    [UserRole.PARENT, Boolean(user.parent) && removed !== UserRole.PARENT],
    [
      UserRole.PLAYER,
      Boolean(user.player) && !user.player?.archivedAt && removed !== UserRole.PLAYER,
    ],
  ];

  if (user.role !== removed && candidates.some(([role, held]) => role === user.role && held)) {
    return user.role;
  }

  return candidates.find(([, held]) => held)?.[0] ?? null;
}

/**
 * Removes one profile from an account. The account itself is deleted only when nothing else is
 * left on it; otherwise it keeps its login and, if the removed profile was its primary role,
 * switches to one it still holds.
 */
export async function removeUserProfile(userId: string, profile: ProfileRole) {
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: profileSelect,
    });
    const nextRole = remainingProfileRole(user, profile);

    if (!nextRole) {
      await transaction.user.delete({ where: { id: userId } });
      return;
    }

    if (profile === UserRole.COACH) {
      await transaction.coach.delete({ where: { userId } });
    } else if (profile === UserRole.PARENT) {
      await transaction.parent.delete({ where: { userId } });
    } else {
      await transaction.player.delete({ where: { userId } });
    }

    if (nextRole !== user.role) {
      await transaction.user.update({ where: { id: userId }, data: { role: nextRole } });
    }
  });
}

/**
 * Soft-deletes a player: the player stays listed as deleted with their category links parked in
 * archivedCategoryIds, so every roster, schedule and leaderboard drops them without extra filters.
 * An account that is only a player is also locked out; a shared account (coach, parent) keeps its
 * login and just loses player access.
 */
export async function archivePlayer(playerId: string) {
  await prisma.$transaction(async (transaction) => {
    const player = await transaction.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        userId: true,
        archivedAt: true,
        categories: { select: { categoryId: true } },
        user: { select: profileSelect },
      },
    });

    if (player.archivedAt) {
      return;
    }

    await transaction.playerCategory.deleteMany({ where: { playerId } });
    await transaction.player.update({
      where: { id: playerId },
      data: {
        archivedAt: new Date(),
        archivedCategoryIds: player.categories.map((assignment) => assignment.categoryId),
      },
    });

    const nextRole = remainingProfileRole(player.user, UserRole.PLAYER);

    if (!nextRole) {
      await transaction.user.update({
        where: { id: player.userId },
        data: { accountStatus: AccountStatus.SUSPENDED },
      });
    } else if (nextRole !== player.user.role) {
      await transaction.user.update({ where: { id: player.userId }, data: { role: nextRole } });
    }
  });
}

/**
 * Brings an archived player back into the categories they had (those that still exist) and
 * reactivates a player-only account.
 */
export async function restorePlayer(playerId: string) {
  await prisma.$transaction(async (transaction) => {
    const player = await transaction.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        userId: true,
        archivedAt: true,
        archivedCategoryIds: true,
        user: { select: profileSelect },
      },
    });

    if (!player.archivedAt) {
      return;
    }

    const existingCategories = await transaction.category.findMany({
      where: { id: { in: player.archivedCategoryIds } },
      select: { id: true },
    });

    await transaction.playerCategory.createMany({
      data: existingCategories.map((category) => ({ playerId, categoryId: category.id })),
      skipDuplicates: true,
    });
    await transaction.player.update({
      where: { id: playerId },
      data: { archivedAt: null, archivedCategoryIds: [] },
    });

    const hasOtherProfile = remainingProfileRole(player.user, UserRole.PLAYER) !== null;

    if (!hasOtherProfile) {
      await transaction.user.update({
        where: { id: player.userId },
        data: { role: UserRole.PLAYER, accountStatus: AccountStatus.ACTIVE },
      });
    }
  });
}

const roleLabels: Record<UserRole, string> = {
  [UserRole.ADMIN]: "administrator",
  [UserRole.COACH]: "trener",
  [UserRole.PARENT]: "roditelj",
  [UserRole.PLAYER]: "igrač",
};

export async function findAccountByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { ...profileSelect, firstName: true, lastName: true },
  });
}

type AccountWithProfiles = NonNullable<Awaited<ReturnType<typeof findAccountByEmail>>>;

/**
 * Guards adding a profile to an account found by e-mail. Without the admin's confirmation it fails
 * with the account's owner and roles in `details`, so the admin screen can ask whether to add the
 * profile to that same account.
 */
export function ensureAccountCanTakeProfile(
  account: AccountWithProfiles,
  profile: ProfileRole,
  confirmed: boolean,
) {
  const fullName = `${account.firstName} ${account.lastName}`;

  if (profile === UserRole.PLAYER && account.player) {
    throw new AppError(
      account.player.archivedAt
        ? `${fullName} je obrisan igrač. Vratite ga s popisa obrisanih igrača.`
        : `${fullName} već ima profil igrača.`,
      409,
    );
  }

  if (profile === UserRole.PARENT && account.parent) {
    throw new AppError(`${fullName} već ima profil roditelja.`, 409);
  }

  if (profile === UserRole.COACH && account.coach) {
    throw new AppError(`${fullName} već ima profil trenera.`, 409);
  }

  if (!confirmed) {
    const roles = listUserProfiles(account).map((role) => roleLabels[role]);

    throw new AppError(
      `E-adresa već pripada korisniku ${fullName} (${roles.join(", ")}).`,
      409,
      {
        code: "EMAIL_BELONGS_TO_EXISTING_USER",
        existingUser: { firstName: account.firstName, lastName: account.lastName, roles },
      },
    );
  }
}
