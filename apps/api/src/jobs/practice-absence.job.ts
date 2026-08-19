import { prisma } from "../lib/prisma";
import { notifyAbsencesForRecentlyStartedPractices } from "../services/practice-notification.service";

/**
 * Notifies active players and their parents when a started practice does not have the player's
 * attendance recorded. Intended to run frequently via cron so notifications go out near start time.
 */
export async function runPracticeAbsenceNotifications(referenceDate = new Date()): Promise<number> {
  return notifyAbsencesForRecentlyStartedPractices(referenceDate);
}

async function main() {
  try {
    const count = await runPracticeAbsenceNotifications();
    console.log(`Practice absence job processed ${count} absent player notification(s).`);
  } catch (error) {
    console.error("Practice absence notification job failed", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
