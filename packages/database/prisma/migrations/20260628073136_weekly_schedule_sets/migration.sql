-- DropIndex
DROP INDEX "schedules_isWeeklyTemplate_dayOfWeek_idx";

-- AlterTable
ALTER TABLE "schedule_occurrences" ADD COLUMN     "activationId" TEXT,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyScheduleId" TEXT;

-- CreateTable
CREATE TABLE "schedule_occurrence_coaches" (
    "occurrenceId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_occurrence_coaches_pkey" PRIMARY KEY ("occurrenceId","coachId")
);

-- CreateTable
CREATE TABLE "weekly_schedules" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_schedule_activations" (
    "id" TEXT NOT NULL,
    "weeklyScheduleId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_schedule_activations_pkey" PRIMARY KEY ("id")
);

-- Backfill named weekly schedules from existing weekly template rows so current data remains usable.
INSERT INTO "weekly_schedules" ("id", "categoryId", "name", "description", "createdAt", "updatedAt")
SELECT
    'legacy-weekly-' || "categories"."id",
    "categories"."id",
    'Osnovni raspored',
    'Automatski preneseno iz postojećih tjednih termina.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "categories"
WHERE EXISTS (
    SELECT 1
    FROM "schedules"
    WHERE "schedules"."categoryId" = "categories"."id"
      AND "schedules"."isWeeklyTemplate" = true
);

UPDATE "schedules"
SET "weeklyScheduleId" = 'legacy-weekly-' || "categoryId"
WHERE "isWeeklyTemplate" = true;

UPDATE "schedule_occurrences"
SET
    "startTime" = date_trunc('day', "schedule_occurrences"."occurrenceDate") + ("schedules"."startTime"::time),
    "endTime" = date_trunc('day', "schedule_occurrences"."occurrenceDate") + ("schedules"."endTime"::time),
    "notes" = "schedules"."notes"
FROM "schedules"
WHERE "schedule_occurrences"."scheduleId" = "schedules"."id"
  AND "schedule_occurrences"."startTime" IS NULL;

INSERT INTO "weekly_schedule_activations" ("id", "weeklyScheduleId", "weekStartDate", "createdAt")
SELECT
    'legacy-activation-' || md5("schedules"."weeklyScheduleId" || '-' || to_char(date_trunc('week', "schedule_occurrences"."occurrenceDate"), 'YYYY-MM-DD')),
    "schedules"."weeklyScheduleId",
    date_trunc('week', "schedule_occurrences"."occurrenceDate"),
    MIN("schedule_occurrences"."createdAt")
FROM "schedule_occurrences"
INNER JOIN "schedules" ON "schedules"."id" = "schedule_occurrences"."scheduleId"
WHERE "schedules"."isWeeklyTemplate" = true
  AND "schedules"."weeklyScheduleId" IS NOT NULL
GROUP BY "schedules"."weeklyScheduleId", date_trunc('week', "schedule_occurrences"."occurrenceDate");

UPDATE "schedule_occurrences"
SET "activationId" = "weekly_schedule_activations"."id"
FROM "schedules", "weekly_schedule_activations"
WHERE "schedule_occurrences"."scheduleId" = "schedules"."id"
  AND "schedule_occurrences"."activationId" IS NULL
  AND "schedules"."isWeeklyTemplate" = true
  AND "schedules"."weeklyScheduleId" IS NOT NULL
  AND "weekly_schedule_activations"."weeklyScheduleId" = "schedules"."weeklyScheduleId"
  AND "weekly_schedule_activations"."weekStartDate" = date_trunc('week', "schedule_occurrences"."occurrenceDate");

INSERT INTO "schedule_occurrence_coaches" ("occurrenceId", "coachId", "assignedAt")
SELECT
    "schedule_occurrences"."id",
    "schedule_coaches"."coachId",
    COALESCE("schedule_occurrences"."createdAt", CURRENT_TIMESTAMP)
FROM "schedule_occurrences"
INNER JOIN "schedule_coaches"
    ON "schedule_coaches"."scheduleId" = "schedule_occurrences"."scheduleId";

-- CreateIndex
CREATE INDEX "schedule_occurrence_coaches_coachId_idx" ON "schedule_occurrence_coaches"("coachId");

-- CreateIndex
CREATE INDEX "weekly_schedules_categoryId_idx" ON "weekly_schedules"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_schedules_categoryId_name_key" ON "weekly_schedules"("categoryId", "name");

-- CreateIndex
CREATE INDEX "weekly_schedule_activations_weekStartDate_idx" ON "weekly_schedule_activations"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_schedule_activations_weeklyScheduleId_weekStartDate_key" ON "weekly_schedule_activations"("weeklyScheduleId", "weekStartDate");

-- CreateIndex
CREATE INDEX "schedule_occurrences_activationId_idx" ON "schedule_occurrences"("activationId");

-- CreateIndex
CREATE INDEX "schedules_weeklyScheduleId_idx" ON "schedules"("weeklyScheduleId");

-- CreateIndex
CREATE INDEX "schedules_isWeeklyTemplate_isArchived_dayOfWeek_idx" ON "schedules"("isWeeklyTemplate", "isArchived", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "weekly_schedule_activations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrence_coaches" ADD CONSTRAINT "schedule_occurrence_coaches_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "schedule_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrence_coaches" ADD CONSTRAINT "schedule_occurrence_coaches_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedule_activations" ADD CONSTRAINT "weekly_schedule_activations_weeklyScheduleId_fkey" FOREIGN KEY ("weeklyScheduleId") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedule_activations" ADD CONSTRAINT "weekly_schedule_activations_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
