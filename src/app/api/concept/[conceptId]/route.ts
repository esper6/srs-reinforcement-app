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

  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: {
      id: true,
      title: true,
      description: true,
      lessonMarkdown: true,
      section: {
        select: {
          name: true,
          curriculum: { select: { name: true, slug: true } },
        },
      },
    },
  });

  if (!concept) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(concept);
}
