-- Rounds redesign Phase 6 cleanup: drop the legacy 0-100 mastery columns.
-- Nothing in the live codebase reads these anymore (Phase 6a removed
-- mastery.ts, the legacy prompt builders, and the legacy tag parsers;
-- Phase 6b deleted DecayQueue/MasteryBar/SubMasteryBreakdown).
--
-- The discrete-level model (level + expertStage + nextDueAt on
-- SubConceptMastery; mastered + masteredAt + synthesisCooldownUntil on
-- ConceptMastery) is now the canonical mastery state.
--
-- SessionMode legacy enum values (ASSESS, LEARN, REVIEW) are intentionally
-- left in place — Postgres can't drop enum values without recreating the
-- type, and they're harmless when no rows reference them. They'll naturally
-- fade as the codebase forgets they exist.

ALTER TABLE "ConceptMastery" DROP COLUMN "score";
ALTER TABLE "ConceptMastery" DROP COLUMN "decayRate";
ALTER TABLE "SubConceptMastery" DROP COLUMN "score";
ALTER TABLE "SubConceptMastery" DROP COLUMN "decayRate";
