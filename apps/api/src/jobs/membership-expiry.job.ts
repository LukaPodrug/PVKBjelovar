import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notifyPlayerParents } from "../services/notification.service";
import { formatDateHr } from "../utils/datetime";

const REMINDER_WINDOW_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Notifies parents of any player whose membership expires within the next 7 days. Deduplicated per
 * membership expiry date so a parent is reminded once per expiry, not every time the job runs.
 * Intended to run daily via cron (e.g. Render scheduled job).
 */
export async function runMembershipExpiryReminders(referenceDate = new Date()): Promise<number> {
  const windowEnd = new Date(referenceDate.getTime() + REMINDER_WINDOW_DAYS * MILLISECONDS_PER_DAY);

  const players = await prisma.player.findMany({
    where: {
      membershipExpiresAt: {
        gte: referenceDate,
        lte: windowEnd,
      },
      user: {
        accountStatus: "ACTIVE",
      },
    },
    select: {
      id: true,
      membershipExpiresAt: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  for (const player of players) {
    if (!player.membershipExpiresAt) {
      continue;
    }

    const expiry = player.membershipExpiresAt;
    const expiryKey = expiry.toISOString().slice(0, 10);
    const daysRemaining = Math.max(
      0,
      Math.ceil((expiry.getTime() - referenceDate.getTime()) / MILLISECONDS_PER_DAY),
    );
    const dayNoun = daysRemaining === 1 ? "dan" : "dana";

    await notifyPlayerParents(player.id, {
      type: NotificationType.MEMBERSHIP_EXPIRING,
      title: "Članarina uskoro istječe",
      body: `Članarina za ${player.user.firstName} ${player.user.lastName} istječe ${formatDateHr(
        expiry,
      )} (za ${daysRemaining} ${dayNoun}).`,
      dedupeKey: `membership-expiry:${player.id}:${expiryKey}`,
      data: { playerId: player.id, membershipExpiresAt: expiry.toISOString() },
    });
  }

  return players.length;
}

async function main() {
  try {
    const count = await runMembershipExpiryReminders();
    console.log(`Membership expiry reminder job processed ${count} player(s).`);
  } catch (error) {
    console.error("Membership expiry reminder job failed", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
