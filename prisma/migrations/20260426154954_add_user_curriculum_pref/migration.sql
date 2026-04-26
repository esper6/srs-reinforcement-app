-- CreateTable
CREATE TABLE "UserCurriculumPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "UserCurriculumPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCurriculumPref_userId_idx" ON "UserCurriculumPref"("userId");

-- CreateIndex
CREATE INDEX "UserCurriculumPref_curriculumId_idx" ON "UserCurriculumPref"("curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCurriculumPref_userId_curriculumId_key" ON "UserCurriculumPref"("userId", "curriculumId");

-- AddForeignKey
ALTER TABLE "UserCurriculumPref" ADD CONSTRAINT "UserCurriculumPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCurriculumPref" ADD CONSTRAINT "UserCurriculumPref_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
