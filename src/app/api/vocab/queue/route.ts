import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStage } from "@/lib/vocab-srs";
import { NextRequest, NextResponse } from "next/server";

const LESSON_BATCH_SIZE = 5;
const MAX_REVIEW_SIZE = 25;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const userId = session.user.id;
  const slug = req.nextUrl.searchParams.get("subject");
  const mode = req.nextUrl.searchParams.get("mode") ?? "reviews";

  if (!slug) {
    return NextResponse.json({ error: "Missing subject param" }, { status: 400 });
  }

  const curriculum = await prisma.curriculum.findUnique({
    where: { slug },
    include: {
      sections: {
        include: {
          concepts: {
            orderBy: { order: "asc" },
            include: {
              vocabWords: {
                orderBy: { order: "asc" },
                include: {
                  progress: { where: { userId } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!curriculum) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const now = new Date();

  type Section = (typeof curriculum.sections)[number];
  type Concept = Section["concepts"][number];
  type Vocab = Concept["vocabWords"][number];

  const allVocab = curriculum.sections.flatMap((s: Section) =>
    s.concepts.flatMap((c: Concept) =>
      c.vocabWords.map((v: Vocab) => ({
        vocabWordId: v.id,
        term: v.term,
        definition: v.definition,
        conceptTitle: c.title,
        progress: v.progress[0] ?? null,
      }))
    )
  );

  // Filter out dismissed words
  const activeVocab = allVocab.filter((v) => !v.progress?.dismissed);

  // New words: no progress record at all
  const newWords = activeVocab.filter((v) => !v.progress);

  // Due words: have progress, review time has passed, not burned (optional)
  const dueWords = activeVocab
    .filter((v) => v.progress && new Date(v.progress.nextReviewAt) <= now)
    .sort((a, b) => new Date(a.progress!.nextReviewAt).getTime() - new Date(b.progress!.nextReviewAt).getTime());

  if (mode === "lessons") {
    // Return a batch of new words for the lesson flow
    const batch = newWords.slice(0, LESSON_BATCH_SIZE).map((v) => ({
      vocabWordId: v.vocabWordId,
      term: v.term,
      definition: v.definition,
      conceptTitle: v.conceptTitle,
      stage: "Novice" as const,
      streak: 0,
      isNew: true,
    }));

    return NextResponse.json({
      queue: batch,
      totalNew: newWords.length,
      totalDue: dueWords.length,
      totalWords: activeVocab.length,
    });
  }

  // Reviews mode: only due words (already learned)
  const queue = dueWords.slice(0, MAX_REVIEW_SIZE).map((v) => ({
    vocabWordId: v.vocabWordId,
    term: v.term,
    definition: v.definition,
    conceptTitle: v.conceptTitle,
    stage: getStage(v.progress!.interval),
    streak: v.progress!.streak,
    isNew: false,
  }));

  return NextResponse.json({
    queue,
    totalNew: newWords.length,
    totalDue: dueWords.length,
    totalWords: activeVocab.length,
  });
}
