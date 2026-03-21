import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateCurrentMastery, getReviewThreshold } from "@/lib/mastery";
import { NextRequest, NextResponse } from "next/server";
import { ReviewQueueItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const subjectSlug = req.nextUrl.searchParams.get("subject");

  const masteries = await prisma.conceptMastery.findMany({
    where: {
      userId,
      score: { gt: 0 },
      ...(subjectSlug
        ? { concept: { section: { curriculum: { slug: subjectSlug } } } }
        : {}),
    },
    include: {
      concept: {
        include: {
          section: {
            include: { curriculum: true },
          },
        },
      },
    },
  });

  const now = Date.now();
  const queue: ReviewQueueItem[] = [];

  type MasteryWithConcept = (typeof masteries)[number];
  for (const m of masteries as MasteryWithConcept[]) {
    const daysSince =
      (now - m.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24);
    const currentMastery = calculateCurrentMastery(
      m.score,
      m.decayRate,
      m.lastReviewedAt
    );

    if (currentMastery < getReviewThreshold(m.score)) {
      queue.push({
        conceptId: m.conceptId,
        conceptTitle: m.concept.title,
        sectionName: m.concept.section.name,
        curriculumName: m.concept.section.curriculum.name,
        curriculumSlug: m.concept.section.curriculum.slug,
        currentMastery,
        previousScore: m.score,
        decayRate: m.decayRate,
        daysSinceReview: daysSince,
      });
    }
  }

  // Sort by lowest mastery first (most overdue), then shuffle within similar scores
  queue.sort((a, b) => a.currentMastery - b.currentMastery);

  // Interleave: don't show same curriculum back-to-back if possible
  const interleaved = interleaveQueue(queue);

  return NextResponse.json({ queue: interleaved, totalDue: interleaved.length });
}

function interleaveQueue(queue: ReviewQueueItem[]): ReviewQueueItem[] {
  if (queue.length <= 1) return queue;

  const result: ReviewQueueItem[] = [];
  const remaining = [...queue];

  while (remaining.length > 0) {
    const lastCurriculum =
      result.length > 0 ? result[result.length - 1].curriculumSlug : null;

    // Try to find an item from a different curriculum
    const diffIdx = remaining.findIndex(
      (item) => item.curriculumSlug !== lastCurriculum
    );

    if (diffIdx !== -1) {
      result.push(remaining.splice(diffIdx, 1)[0]);
    } else {
      // No choice, same curriculum
      result.push(remaining.shift()!);
    }
  }

  return result;
}
