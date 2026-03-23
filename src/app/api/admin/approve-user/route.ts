import { getServerSession } from "next-auth";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId: string };
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { approved: true },
    select: { id: true, email: true, approved: true },
  });

  return NextResponse.json({ success: true, user });
}
