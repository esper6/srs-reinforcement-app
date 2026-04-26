import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseSynthesisResult } from "@/lib/claude";
import { streamChatResponse, LlmConfig } from "@/lib/llm";
import { decrypt } from "@/lib/crypto";
import { buildSynthesisPrompt } from "@/lib/prompts";
import { SYNTHESIS_COOLDOWN_MS } from "@/lib/levels";
import { FacetLevel } from "@prisma/client";
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
  const { conceptId, sessionId, userMessage } = await req.json();

  if (!conceptId || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (typeof userMessage !== "string" || userMessage.length > 5000) {
    return NextResponse.json({ error: "Message too long (max 5000 chars)" }, { status: 400 });
  }

  // Rate limit (mirrors /api/round)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await prisma.chatMessage.count({
    where: {
      chatSession: { userId },
      role: "user",
      createdAt: { gte: fiveMinAgo },
    },
  });
  if (recentCount >= 30) {
    return NextResponse.json(
      { error: "Slow down — too many messages. Try again in a few minutes." },
      { status: 429 }
    );
  }

  // Strip injected tags
  const sanitizedMessage = userMessage
    .replace(/<\/?round_result[^>]*\/?>/gi, "")
    .replace(/<\/?synthesis_result[^>]*\/?>/gi, "")
    .replace(/<\/?sub_mastery[^>]*\/?>/gi, "")
    .replace(/<\/?mastery[^>]*\/?>/gi, "");

  // Load concept
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }
  if (concept.facets.length === 0) {
    return NextResponse.json(
      { error: "This concept has no facets defined yet. Re-import the curriculum." },
      { status: 400 }
    );
  }

  // Load conceptMastery + subMasteries — synthesis requires existing mastery
  const conceptMastery = await prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId, conceptId } },
    include: { subMasteries: true },
  });

  if (!conceptMastery) {
    return NextResponse.json(
      { error: "No mastery on this concept yet — work through the rounds first." },
      { status: 400 }
    );
  }

  if (conceptMastery.mastered) {
    return NextResponse.json(
      { error: "This concept is already Mastered." },
      { status: 400 }
    );
  }

  const now = new Date();

  if (
    conceptMastery.synthesisCooldownUntil &&
    conceptMastery.synthesisCooldownUntil > now
  ) {
    return NextResponse.json(
      {
        error: `Synthesis cooldown active. Retry after ${conceptMastery.synthesisCooldownUntil.toISOString()}.`,
        cooldownUntil: conceptMastery.synthesisCooldownUntil,
      },
      { status: 400 }
    );
  }

  // Eligibility: every facet must be at EXPERT stage 3
  type Sub = (typeof conceptMastery.subMasteries)[number];
  const subByName = new Map<string, Sub>(
    conceptMastery.subMasteries.map((s: Sub) => [s.name, s])
  );
  const notReady: string[] = [];
  for (const facetName of concept.facets) {
    const sub = subByName.get(facetName);
    if (!sub || sub.level !== FacetLevel.EXPERT || sub.expertStage < 3) {
      notReady.push(facetName);
    }
  }
  if (notReady.length > 0) {
    return NextResponse.json(
      {
        error: `Synthesis requires all facets at Expert stage 3. Not ready: ${notReady.join(", ")}.`,
        notReady,
      },
      { status: 400 }
    );
  }

  // Get-or-create the SYNTHESIS ChatSession
  let chatSession;
  if (sessionId) {
    chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chatSession || chatSession.userId !== userId || chatSession.mode !== "SYNTHESIS") {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
    if (chatSession.finishedAt) {
      return NextResponse.json({ error: "Session has already concluded" }, { status: 400 });
    }
  } else {
    chatSession = await prisma.chatSession.create({
      data: { userId, conceptId, mode: "SYNTHESIS" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Save user message
  await prisma.chatMessage.create({
    data: { chatSessionId: chatSession.id, role: "user", content: sanitizedMessage },
  });

  const messages = chatSession.messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messages.push({ role: "user", content: sanitizedMessage });

  // Student responses received (excludes [START SYNTHESIS] trigger)
  const exchangeCount = messages.filter(
    (m) => m.role === "user" && !m.content.startsWith("[START SYNTHESIS]")
  ).length;

  const systemPrompt = buildSynthesisPrompt({
    conceptTitle: concept.title,
    facetNames: concept.facets,
    lessonMarkdown: concept.lessonMarkdown,
    exchangeCount,
  });

  // Resolve LLM provider + key (same pattern as /api/round)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredProvider: true, apiKeys: true },
  });

  let llmConfig: LlmConfig;
  if (user.preferredProvider === "CLAUDE_RELAY") {
    if (!process.env.CLAUDE_RELAY_URL || !process.env.CLAUDE_RELAY_SECRET) {
      return NextResponse.json(
        { error: "Claude Relay is not configured on this server." },
        { status: 500 }
      );
    }
    llmConfig = { provider: "CLAUDE_RELAY", apiKey: "" };
  } else {
    const providerKey = user.apiKeys.find(
      (k: { provider: string }) => k.provider === user.preferredProvider
    );
    if (!providerKey) {
      return NextResponse.json(
        {
          error: `No API key configured for ${user.preferredProvider}. Add one in Settings → API Keys.`,
        },
        { status: 400 }
      );
    }
    llmConfig = {
      provider: user.preferredProvider,
      apiKey: decrypt(providerKey.encryptedKey),
    };
  }

  const stream = await streamChatResponse(systemPrompt, messages, llmConfig);
  const [clientStream, collectorStream] = stream.tee();

  collectAndSaveSynthesis(collectorStream, chatSession.id, conceptMastery.id).catch(
    console.error
  );

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": chatSession.id,
    },
  });
}

async function collectAndSaveSynthesis(
  stream: ReadableStream<Uint8Array>,
  chatSessionId: string,
  conceptMasteryId: string
) {
  const decoder = new TextDecoder();
  let fullText = "";

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.text) fullText += data.text;
        } catch {
          // skip parse errors
        }
      }
    }
  }

  await prisma.chatMessage.create({
    data: { chatSessionId, role: "assistant", content: fullText },
  });

  const result = parseSynthesisResult(fullText);
  if (!result) return; // Synthesis still in progress

  const now = new Date();

  if (result.outcome === "pass") {
    await prisma.conceptMastery.update({
      where: { id: conceptMasteryId },
      data: {
        mastered: true,
        masteredAt: now,
        synthesisCooldownUntil: null, // clear in case it was set from a prior fail
        lastReviewedAt: now,
        reviewCount: { increment: 1 },
      },
    });
  } else {
    // fail: 1-week cooldown, no facet drops (per design)
    const cooldownUntil = new Date(now.getTime() + SYNTHESIS_COOLDOWN_MS);
    await prisma.conceptMastery.update({
      where: { id: conceptMasteryId },
      data: {
        synthesisCooldownUntil: cooldownUntil,
        lastReviewedAt: now,
        reviewCount: { increment: 1 },
      },
    });
  }

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { finishedAt: now },
  });
}
