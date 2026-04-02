import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  const { vocabWordId } = await req.json();

  if (!vocabWordId || typeof vocabWordId !== "string") {
    return NextResponse.json({ error: "Missing vocabWordId" }, { status: 400 });
  }

  // Verify the vocab word exists
  const vocabWord = await prisma.vocabWord.findUnique({
    where: { id: vocabWordId },
  });
  if (!vocabWord) {
    return NextResponse.json({ error: "Vocab word not found" }, { status: 404 });
  }

  // Upsert: create progress record with dismissed=true, or update existing
  await prisma.userVocabProgress.upsert({
    where: {
      userId_vocabWordId: { userId, vocabWordId },
    },
    create: {
      userId,
      vocabWordId,
      dismissed: true,
    },
    update: {
      dismissed: true,
    },
  });

  return NextResponse.json({ ok: true });
}
