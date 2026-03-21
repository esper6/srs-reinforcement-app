import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const slug = req.nextUrl.searchParams.get("subject");

  if (!slug) {
    return NextResponse.json({ error: "Missing subject param" }, { status: 400 });
  }

  const masteries = await prisma.conceptMastery.findMany({
    where: {
      userId,
      concept: { section: { curriculum: { slug } } },
    },
    include: {
      concept: { select: { id: true, title: true } },
      subMasteries: { select: { name: true, score: true, decayRate: true } },
    },
  });

  return NextResponse.json({
    masteries: masteries.map((m: typeof masteries[number]) => ({
      conceptId: m.concept.id,
      title: m.concept.title,
      score: Math.round(m.score),
      subMasteries: m.subMasteries.map((s: { name: string; score: number; decayRate: number }) => ({
        name: s.name,
        score: Math.round(s.score),
        decayRate: s.decayRate,
      })),
    })),
  });
}
