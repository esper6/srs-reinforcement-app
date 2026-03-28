import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStage } from "@/lib/vocab-srs";
import { NextRequest, NextResponse } from "next/server";

const MAX_QUEUE_SIZE = 25;

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

  // Split into new words and due words
  const newWords = allVocab
    .filter((v) => !v.progress)
    .map((v) => ({
      vocabWordId: v.vocabWordId,
      term: v.term,
      definition: v.definition,
      conceptTitle: v.conceptTitle,
      stage: "Apprentice" as const,
      streak: 0,
      isNew: true,
    }));

  const dueWords = allVocab
    .filter((v) => v.progress && new Date(v.progress.nextReviewAt) <= now)
    .sort((a, b) => new Date(a.progress!.nextReviewAt).getTime() - new Date(b.progress!.nextReviewAt).getTime())
    .map((v) => ({
      vocabWordId: v.vocabWordId,
      term: v.term,
      definition: v.definition,
      conceptTitle: v.conceptTitle,
      stage: getStage(v.progress!.interval),
      streak: v.progress!.streak,
      isNew: false,
    }));

  // Due reviews first, then new words
  const queue = [...dueWords, ...newWords].slice(0, MAX_QUEUE_SIZE);

  return NextResponse.json({
    queue,
    totalDue: dueWords.length + newWords.length,
    totalWords: allVocab.length,
  });
}
