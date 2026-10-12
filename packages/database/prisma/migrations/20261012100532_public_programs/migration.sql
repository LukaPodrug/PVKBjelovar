-- CreateEnum
CREATE TYPE "ProgramAudience" AS ENUM ('MEMBERS', 'PUBLIC');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "audience" "ProgramAudience" NOT NULL DEFAULT 'MEMBERS',
ADD COLUMN     "pricePerPracticeCents" INTEGER,
ADD COLUMN     "signupCloseDaysBefore" INTEGER,
ADD COLUMN     "signupCloseTime" TEXT;

-- AlterTable
ALTER TABLE "club_settings" ADD COLUMN     "bankRecipientAddress" TEXT,
ADD COLUMN     "bankRecipientCity" TEXT;

-- CreateTable
CREATE TABLE "program_slots" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_registrations" (
    "id" TEXT NOT NULL,
    "referenceNumber" SERIAL NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "childFirstName" TEXT NOT NULL,
    "childLastName" TEXT NOT NULL,
    "childDateOfBirth" TIMESTAMP(3) NOT NULL,
    "parentFirstName" TEXT NOT NULL,
    "parentLastName" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "gdprConsent" BOOLEAN NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_slots_categoryId_idx" ON "program_slots"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "program_registrations_referenceNumber_key" ON "program_registrations"("referenceNumber");

-- CreateIndex
CREATE INDEX "program_registrations_categoryId_sessionDate_idx" ON "program_registrations"("categoryId", "sessionDate");

-- AddForeignKey
ALTER TABLE "program_slots" ADD CONSTRAINT "program_slots_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_registrations" ADD CONSTRAINT "program_registrations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
