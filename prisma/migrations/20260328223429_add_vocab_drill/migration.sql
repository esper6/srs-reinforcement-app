-- CreateTable
CREATE TABLE "VocabWord" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VocabWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVocabProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vocabWordId" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "interval" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCorrect" INTEGER NOT NULL DEFAULT 0,
    "totalWrong" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserVocabProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabWord_conceptId_idx" ON "VocabWord"("conceptId");

-- CreateIndex
CREATE INDEX "UserVocabProgress_userId_idx" ON "UserVocabProgress"("userId");

-- CreateIndex
CREATE INDEX "UserVocabProgress_vocabWordId_idx" ON "UserVocabProgress"("vocabWordId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVocabProgress_userId_vocabWordId_key" ON "UserVocabProgress"("userId", "vocabWordId");

-- AddForeignKey
ALTER TABLE "VocabWord" ADD CONSTRAINT "VocabWord_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVocabProgress" ADD CONSTRAINT "UserVocabProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserVocabProgress" ADD CONSTRAINT "UserVocabProgress_vocabWordId_fkey" FOREIGN KEY ("vocabWordId") REFERENCES "VocabWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
