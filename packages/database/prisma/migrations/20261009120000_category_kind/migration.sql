-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('REGULAR', 'PROGRAM');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'REGULAR';

-- CreateIndex
CREATE INDEX "categories_kind_idx" ON "categories"("kind");
