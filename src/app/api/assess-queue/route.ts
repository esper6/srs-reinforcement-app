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

  const curriculum = await prisma.curriculum.findUnique({
    where: { slug },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          concepts: {
            orderBy: { order: "asc" },
            include: {
              masteries: { where: { userId } },
            },
          },
        },
      },
    },
  });

  if (!curriculum) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find concepts with no mastery record (never assessed)
  const unstarted = curriculum.sections.flatMap((s) =>
    s.concepts
      .filter((c) => c.masteries.length === 0)
      .map((c) => ({
        conceptId: c.id,
        conceptTitle: c.title,
        sectionName: s.name,
        curriculumName: curriculum.name,
        curriculumSlug: curriculum.slug,
      }))
  );

  return NextResponse.json({ queue: unstarted, totalDue: unstarted.length });
}
