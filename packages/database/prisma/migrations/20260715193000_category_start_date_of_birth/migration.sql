ALTER TABLE "categories" ADD COLUMN "startDateOfBirth" TIMESTAMP(3);
ALTER TABLE "categories" DROP COLUMN IF EXISTS "minimum_age_years";
