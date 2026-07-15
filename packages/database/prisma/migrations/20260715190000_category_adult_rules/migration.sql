ALTER TABLE "categories" ADD COLUMN "minimum_age_years" INTEGER;
ALTER TABLE "categories" ALTER COLUMN "endDateOfBirth" DROP NOT NULL;
