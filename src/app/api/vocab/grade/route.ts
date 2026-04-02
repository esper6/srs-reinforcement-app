import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { gradeVocabAnswer } from "@/lib/vocab-grader";
import { processCorrect, processWrong, getStage } from "@/lib/vocab-srs";
import { LlmConfig } from "@/lib/llm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const userId = session.user.id;
  const { vocabWordId, answer, mode } = (await req.json()) as {
    vocabWordId: string;
    answer: string;
    mode?: "lessons" | "reviews";
  };

  if (!vocabWordId || typeof vocabWordId !== "string") {
    return NextResponse.json({ error: "Missing vocabWordId" }, { status: 400 });
  }
  if (!answer || typeof answer !== "string" || answer.length > 1000) {
    return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  }

  // Load vocab word
  const vocabWord = await prisma.vocabWord.findUnique({
    where: { id: vocabWordId },
    select: { id: true, term: true, definition: true },
  });
  if (!vocabWord) {
    return NextResponse.json({ error: "Vocab word not found" }, { status: 404 });
  }

  // Load user's LLM config
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      preferredProvider: true,
      apiKeys: true,
    },
  });

  const providerKey = user.apiKeys.find(
    (k: { provider: string }) => k.provider === user.preferredProvider
  );
  if (!providerKey) {
    return NextResponse.json(
      { error: `No API key configured for ${user.preferredProvider}. Add one in Settings.` },
      { status: 400 }
    );
  }

  const llmConfig: LlmConfig = {
    provider: user.preferredProvider,
    apiKey: decrypt(providerKey.encryptedKey),
  };

  // Grade the answer
  const gradeResult = await gradeVocabAnswer(
    vocabWord.term,
    vocabWord.definition,
    answer.trim(),
    llmConfig
  );

  // In lesson mode, wrong answers don't touch the DB — just return feedback
  // so the word cycles back for another attempt
  if (mode === "lessons" && !gradeResult.correct) {
    return NextResponse.json({
      correct: false,
      feedback: gradeResult.feedback,
      definition: vocabWord.definition,
      stage: "Apprentice",
      streak: 0,
    });
  }

  // Load or create progress
  const existing = await prisma.userVocabProgress.findUnique({
    where: { userId_vocabWordId: { userId, vocabWordId } },
  });

  const current = existing
    ? {
        streak: existing.streak,
        easeFactor: existing.easeFactor,
        interval: existing.interval,
        totalCorrect: existing.totalCorrect,
        totalWrong: existing.totalWrong,
      }
    : { streak: 0, easeFactor: 2.5, interval: 4, totalCorrect: 0, totalWrong: 0 };

  const updated = gradeResult.correct
    ? processCorrect(current)
    : processWrong(current);

  await prisma.userVocabProgress.upsert({
    where: { userId_vocabWordId: { userId, vocabWordId } },
    update: {
      streak: updated.streak,
      easeFactor: updated.easeFactor,
      interval: updated.interval,
      nextReviewAt: updated.nextReviewAt,
      totalCorrect: updated.totalCorrect,
      totalWrong: updated.totalWrong,
    },
    create: {
      userId,
      vocabWordId,
      streak: updated.streak,
      easeFactor: updated.easeFactor,
      interval: updated.interval,
      nextReviewAt: updated.nextReviewAt,
      totalCorrect: updated.totalCorrect,
      totalWrong: updated.totalWrong,
    },
  });

  return NextResponse.json({
    correct: gradeResult.correct,
    feedback: gradeResult.feedback,
    definition: vocabWord.definition,
    stage: getStage(updated.interval),
    streak: updated.streak,
  });
}
