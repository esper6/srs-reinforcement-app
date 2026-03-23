-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredProvider" "LlmProvider" NOT NULL DEFAULT 'ANTHROPIC';

-- CreateTable
CREATE TABLE "UserApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "encryptedKey" TEXT NOT NULL,

    CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserApiKey_userId_idx" ON "UserApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_userId_provider_key" ON "UserApiKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
