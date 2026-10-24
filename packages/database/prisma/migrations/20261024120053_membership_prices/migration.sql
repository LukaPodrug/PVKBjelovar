-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "monthlyPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "club_settings" ADD COLUMN     "membershipPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "membershipPriceCents" INTEGER;
