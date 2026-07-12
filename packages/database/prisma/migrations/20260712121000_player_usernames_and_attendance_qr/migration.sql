-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "attendance_qr_sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_qr_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_qr_sessions_token_key" ON "attendance_qr_sessions"("token");

-- CreateIndex
CREATE INDEX "attendance_qr_sessions_occurrenceId_expiresAt_idx" ON "attendance_qr_sessions"("occurrenceId", "expiresAt");

-- CreateIndex
CREATE INDEX "attendance_qr_sessions_createdById_idx" ON "attendance_qr_sessions"("createdById");

-- AddForeignKey
ALTER TABLE "attendance_qr_sessions" ADD CONSTRAINT "attendance_qr_sessions_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "schedule_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_sessions" ADD CONSTRAINT "attendance_qr_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
