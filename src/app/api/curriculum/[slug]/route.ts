import { getServerSession } from "next-auth";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Admin-only: deleting a curriculum is destructive across all users
// (curricula are shared globally — see CLAUDE.md "Speculative" notes).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const existing = await prisma.curriculum.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascade chain (all wired in prisma/schema.prisma):
  //   Curriculum → Section → Concept →
  //     ConceptMastery → SubConceptMastery
  //     ChatSession    → ChatMessage
  //     VocabWord      → UserVocabProgress
  await prisma.curriculum.delete({ where: { id: existing.id } });

  return NextResponse.json({ success: true });
}

// Archive / unarchive — per-user. Body: { archived: true | false }.
// Any approved user can hide a curriculum from their own dashboard. State is
// stored on UserCurriculumPref, never mutates the shared Curriculum row.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const archived = (body as { archived?: unknown })?.archived;
  if (typeof archived !== "boolean") {
    return NextResponse.json(
      { error: 'Body must include { archived: boolean }' },
      { status: 400 }
    );
  }

  const { slug } = await params;
  const existing = await prisma.curriculum.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = session.user.id;
  const archivedAt = archived ? new Date() : null;
  await prisma.userCurriculumPref.upsert({
    where: { userId_curriculumId: { userId, curriculumId: existing.id } },
    update: { archivedAt },
    create: { userId, curriculumId: existing.id, archivedAt },
  });

  return NextResponse.json({ success: true, archived });
}
