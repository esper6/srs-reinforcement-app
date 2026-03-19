-- CreateTable
CREATE TABLE "SubConceptMastery" (
    "id" TEXT NOT NULL,
    "conceptMasteryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decayRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubConceptMastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubConceptMastery_conceptMasteryId_idx" ON "SubConceptMastery"("conceptMasteryId");

-- CreateIndex
CREATE UNIQUE INDEX "SubConceptMastery_conceptMasteryId_name_key" ON "SubConceptMastery"("conceptMasteryId", "name");

-- AddForeignKey
ALTER TABLE "SubConceptMastery" ADD CONSTRAINT "SubConceptMastery_conceptMasteryId_fkey" FOREIGN KEY ("conceptMasteryId") REFERENCES "ConceptMastery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
