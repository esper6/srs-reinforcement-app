import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const { conceptId } = await params;
  const userId = session.user.id;

  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: {
      id: true,
      title: true,
      description: true,
      lessonMarkdown: true,
      facets: true,
      section: {
        select: {
          name: true,
          curriculum: { select: { name: true, slug: true } },
        },
      },
      // The current user's mastery for this concept (at most one row).
      // Used by the rounds-redesign UI to decide LessonGate vs RoundView vs
      // Mastered celebration, and to seed the round prompt with current level.
      masteries: {
        where: { userId },
        select: {
          mastered: true,
          masteredAt: true,
          synthesisCooldownUntil: true,
          subMasteries: {
            select: {
              name: true,
              level: true,
              expertStage: true,
              nextDueAt: true,
            },
          },
        },
      },
    },
  });

  if (!concept) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Flatten masteries[] (at most 1, since filter is unique on userId) into
  // a single nullable mastery field for the client.
  return NextResponse.json({
    id: concept.id,
    title: concept.title,
    description: concept.description,
    lessonMarkdown: concept.lessonMarkdown,
    facets: concept.facets,
    section: concept.section,
    mastery: concept.masteries[0] ?? null,
  });
}
