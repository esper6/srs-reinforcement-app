import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

const VALID_PROVIDERS = ["ANTHROPIC", "OPENAI", "GOOGLE"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return VALID_PROVIDERS.includes(p as Provider);
}

// Save or update an API key
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const { provider, apiKey } = (await req.json()) as {
    provider: string;
    apiKey: string;
  };

  if (!provider || !isValidProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== "string" || apiKey.length < 10) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

  const encryptedKey = encrypt(apiKey);

  await prisma.userApiKey.upsert({
    where: {
      userId_provider: { userId: session.user.id, provider },
    },
    update: { encryptedKey },
    create: {
      userId: session.user.id,
      provider,
      encryptedKey,
    },
  });

  return NextResponse.json({ success: true });
}

// Remove an API key
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = (await req.json()) as { provider: string };
  if (!provider || !isValidProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  await prisma.userApiKey.deleteMany({
    where: { userId: session.user.id, provider },
  });

  // If this was the preferred provider, reset to ANTHROPIC
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { preferredProvider: true },
  });
  if (user.preferredProvider === provider) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferredProvider: "ANTHROPIC" },
    });
  }

  return NextResponse.json({ success: true });
}

// Set preferred provider
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = (await req.json()) as { provider: string };
  if (!provider || !isValidProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Verify they have a key for this provider
  const key = await prisma.userApiKey.findUnique({
    where: {
      userId_provider: { userId: session.user.id, provider },
    },
  });
  if (!key) {
    return NextResponse.json(
      { error: "Add an API key for this provider first" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { preferredProvider: provider },
  });

  return NextResponse.json({ success: true });
}
