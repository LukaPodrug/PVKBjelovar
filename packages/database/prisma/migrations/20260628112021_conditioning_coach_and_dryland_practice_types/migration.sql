-- CreateEnum
CREATE TYPE "PracticeType" AS ENUM ('WATER', 'DRYLAND');

-- AlterTable
ALTER TABLE "coaches" ADD COLUMN     "isConditioningCoach" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "schedule_occurrences" ADD COLUMN     "practiceType" "PracticeType" NOT NULL DEFAULT 'WATER';

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "practiceType" "PracticeType" NOT NULL DEFAULT 'WATER';
