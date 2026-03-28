import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseMasteryTag, parseSubMasteryTags } from "@/lib/claude";
import { streamChatResponse, LlmConfig } from "@/lib/llm";
import { decrypt } from "@/lib/crypto";
import {
  buildAssessPrompt,
  buildLearnPrompt,
  buildReviewPrompt,
  buildExtraCreditPrompt,
} from "@/lib/prompts";
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
  const { conceptId, mode, sessionId, userMessage, extraCredit } = await req.json();

  if (!conceptId || !mode || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // --- Input validation & rate limiting ---
  if (typeof userMessage !== "string" || userMessage.length > 5000) {
    return NextResponse.json({ error: "Message too long (max 5000 chars)" }, { status: 400 });
  }

  // Rate limit: max 30 messages per 5 minutes per user
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

  // --- Prompt injection defenses ---
  // Strip any mastery/sub-mastery tags from user input so they can't inject fake scores
  const sanitizedMessage = userMessage
    .replace(/<\/?sub_mastery[^>]*\/?>/gi, "")
    .replace(/<\/?mastery[^>]*\/?>/gi, "");

  // Load concept with section and curriculum
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    include: { section: { include: { curriculum: true } } },
  });

  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  // Get or create chat session
  let chatSession;
  if (sessionId) {
    chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  if (!chatSession) {
    chatSession = await prisma.chatSession.create({
      data: {
        userId,
        conceptId,
        mode: mode as "ASSESS" | "LEARN" | "REVIEW",
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Save user message (sanitized)
  await prisma.chatMessage.create({
    data: {
      chatSessionId: chatSession.id,
      role: "user",
      content: sanitizedMessage,
    },
  });

  // Build conversation history
  const messages = chatSession.messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messages.push({ role: "user", content: sanitizedMessage });

  // Build system prompt based on mode
  // Count exchanges (pairs of user+assistant messages, excluding the initial trigger)
  const exchangeCount = Math.floor(messages.length / 2);

  let systemPrompt: string;

  if (extraCredit) {
    // Extra credit mode: no scoring, just open conversation
    systemPrompt = buildExtraCreditPrompt(concept.title, concept.lessonMarkdown);
  } else {
    const mastery = await prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
      include: { subMasteries: true },
    });

    if (mode === "ASSESS") {
      const existingFacets = mastery?.subMasteries?.map(
        (s: { name: string; score: number }) => s.name
      );
      systemPrompt = buildAssessPrompt(concept.title, concept.lessonMarkdown, exchangeCount, existingFacets);
    } else if (mode === "LEARN") {
      const weakAreas = mastery?.subMasteries
        ?.sort((a: { score: number }, b: { score: number }) => a.score - b.score)
        .slice(0, 3)
        .map((s: { name: string; score: number }) => `${s.name} (${Math.round(s.score)}%)`)
        .join(", ") ?? "";
      const existingFacets = mastery?.subMasteries?.map(
        (s: { name: string; score: number }) => s.name
      );
      systemPrompt = buildLearnPrompt(
        concept.title,
        concept.lessonMarkdown,
        mastery?.score ?? 0,
        weakAreas,
        exchangeCount,
        existingFacets
      );
    } else {
      const daysSince = mastery
        ? (Date.now() - mastery.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const subMasteries = mastery?.subMasteries?.map((s: { name: string; score: number }) => ({
        name: s.name,
        score: Math.round(s.score),
      }));
      systemPrompt = buildReviewPrompt(
        concept.title,
        concept.lessonMarkdown,
        mastery?.score ?? 0,
        daysSince,
        subMasteries,
        exchangeCount
      );
    }
  }

  // Resolve user's LLM provider + API key
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      preferredProvider: true,
      apiKeys: true,
    },
  });

  const providerKey = user.apiKeys.find(
    (k: { provider: string }) => k.provider === user.preferredProvider
  );
  if (!providerKey) {
    return NextResponse.json(
      { error: `No API key configured for ${user.preferredProvider}. Add one in Settings → API Keys.` },
      { status: 400 }
    );
  }

  const llmConfig: LlmConfig = {
    provider: user.preferredProvider,
    apiKey: decrypt(providerKey.encryptedKey),
  };

  // Stream the response
  const stream = await streamChatResponse(systemPrompt, messages, llmConfig);

  // We need to tee the stream: one for the client, one to collect the full response
  const [clientStream, collectorStream] = stream.tee();

  // Collect full response in background for DB storage
  collectAndSave(collectorStream, chatSession.id, userId, conceptId, !!extraCredit).catch(
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

async function collectAndSave(
  stream: ReadableStream<Uint8Array>,
  chatSessionId: string,
  userId: string,
  conceptId: string,
  extraCredit: boolean = false
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

  // Save assistant message
  await prisma.chatMessage.create({
    data: {
      chatSessionId,
      role: "assistant",
      content: fullText,
    },
  });

  // Skip mastery updates in extra credit mode
  if (extraCredit) return;

  // Parse sub-mastery tags (new format) or fall back to legacy mastery tag
  const rawSubMasteries = parseSubMasteryTags(fullText);
  const legacyMastery = parseMasteryTag(fullText);

  // --- Server-side score validation ---
  // Clamp scores to valid range, cap facet count, validate decay rates
  const subMasteries = rawSubMasteries
    .slice(0, 8) // Max 8 facets (spec says 3-5, leave headroom)
    .map((s) => ({
      name: s.name.slice(0, 100), // Cap facet name length
      score: Math.max(0, Math.min(100, Math.round(s.score))),
      decayRate: Math.max(0.03, Math.min(0.3, s.decayRate)),
    }));

  if (subMasteries.length > 0) {
    // Compute overall score as average of sub-mastery scores
    const overallScore = Math.round(
      subMasteries.reduce((sum, s) => sum + s.score, 0) / subMasteries.length
    );
    // Overall decay rate as average weighted toward faster decay
    const overallDecay =
      subMasteries.reduce((sum, s) => sum + s.decayRate, 0) / subMasteries.length;

    const conceptMastery = await prisma.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {
        score: overallScore,
        decayRate: overallDecay,
        lastReviewedAt: new Date(),
        reviewCount: { increment: 1 },
      },
      create: {
        userId,
        conceptId,
        score: overallScore,
        decayRate: overallDecay,
        lastReviewedAt: new Date(),
        reviewCount: 1,
      },
    });

    // Upsert each sub-mastery
    for (const sub of subMasteries) {
      await prisma.subConceptMastery.upsert({
        where: {
          conceptMasteryId_name: {
            conceptMasteryId: conceptMastery.id,
            name: sub.name,
          },
        },
        update: {
          score: sub.score,
          decayRate: sub.decayRate,
          lastReviewedAt: new Date(),
        },
        create: {
          conceptMasteryId: conceptMastery.id,
          name: sub.name,
          score: sub.score,
          decayRate: sub.decayRate,
          lastReviewedAt: new Date(),
        },
      });
    }
  } else if (legacyMastery) {
    // Fallback for legacy single mastery tag (clamped)
    const clampedScore = Math.max(0, Math.min(100, Math.round(legacyMastery.score)));
    const clampedDecay = Math.max(0.03, Math.min(0.3, legacyMastery.decayRate));
    await prisma.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {
        score: clampedScore,
        decayRate: clampedDecay,
        lastReviewedAt: new Date(),
        reviewCount: { increment: 1 },
      },
      create: {
        userId,
        conceptId,
        score: clampedScore,
        decayRate: clampedDecay,
        lastReviewedAt: new Date(),
        reviewCount: 1,
      },
    });
  }
}
