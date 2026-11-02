-- AlterTable
ALTER TABLE "players" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "players_archivedAt_idx" ON "players"("archivedAt");
