-- Rounds redesign Phase 2.0: pre-extracted facet names per concept.
-- Empty array default means existing concepts have no facets defined yet —
-- the round endpoints refuse to operate on those until they're populated
-- (via curriculum re-import after the curriculum-generator-prompt update).

-- AlterTable
ALTER TABLE "Concept" ADD COLUMN "facets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
