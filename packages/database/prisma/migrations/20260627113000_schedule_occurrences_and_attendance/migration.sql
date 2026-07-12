-- CreateTable
CREATE TABLE "schedule_occurrences" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_attendance" (
    "occurrenceId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_attendance_pkey" PRIMARY KEY ("occurrenceId","playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_scheduleId_occurrenceDate_key" ON "schedule_occurrences"("scheduleId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "schedule_occurrences_occurrenceDate_idx" ON "schedule_occurrences"("occurrenceDate");

-- CreateIndex
CREATE INDEX "schedule_attendance_playerId_idx" ON "schedule_attendance"("playerId");

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_attendance" ADD CONSTRAINT "schedule_attendance_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "schedule_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_attendance" ADD CONSTRAINT "schedule_attendance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
