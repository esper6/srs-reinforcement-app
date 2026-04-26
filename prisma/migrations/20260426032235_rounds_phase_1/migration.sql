-- CreateEnum
CREATE TYPE "FacetLevel" AS ENUM ('NOVICE', 'APPRENTICE', 'JOURNEYMAN', 'EXPERT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SessionMode" ADD VALUE 'ROUND';
ALTER TYPE "SessionMode" ADD VALUE 'SYNTHESIS';
ALTER TYPE "SessionMode" ADD VALUE 'EXTRA_CREDIT';

-- AlterTable
ALTER TABLE "ConceptMastery" ADD COLUMN     "mastered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "masteredAt" TIMESTAMP(3),
ADD COLUMN     "synthesisCooldownUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SubConceptMastery" ADD COLUMN     "expertStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "level" "FacetLevel" NOT NULL DEFAULT 'NOVICE',
ADD COLUMN     "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "SubConceptMastery_nextDueAt_idx" ON "SubConceptMastery"("nextDueAt");

-- ─── Rounds redesign: data wipe ───
-- The redesign restarts mastery from scratch with discrete levels.
-- ConceptMastery FKs cascade to SubConceptMastery, and ChatSession FKs cascade to ChatMessage,
-- so two DELETEs cover all legacy mastery + conversation data. Vocab progress is untouched.
DELETE FROM "ConceptMastery";
DELETE FROM "ChatSession" WHERE "mode" IN ('ASSESS', 'LEARN', 'REVIEW');
