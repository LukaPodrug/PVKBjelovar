-- CreateEnum
CREATE TYPE "SwimmingAbility" AS ENUM ('CAN_SWIM', 'PARTIAL', 'CANNOT_SWIM');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "swimmingAbility" "SwimmingAbility";

-- AlterTable
ALTER TABLE "program_registrations" ADD COLUMN     "childSwimmingAbility" "SwimmingAbility";

-- AlterTable
ALTER TABLE "signup_requests" ADD COLUMN     "childSwimmingAbility" "SwimmingAbility";
