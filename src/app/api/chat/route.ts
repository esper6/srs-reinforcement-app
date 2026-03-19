import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { streamChatResponse, parseMasteryTag, parseSubMasteryTags } from "@/lib/claude";
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

  const userId = (session.user as { id: string }).id;
  const { conceptId, mode, sessionId, userMessage, extraCredit } = await req.json();

  if (!conceptId || !mode || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

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

  // Save user message
  await prisma.chatMessage.create({
    data: {
      chatSessionId: chatSession.id,
      role: "user",
      content: userMessage,
    },
  });

  // Build conversation history
  const messages = chatSession.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messages.push({ role: "user", content: userMessage });

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
      systemPrompt = buildAssessPrompt(concept.title, concept.lessonMarkdown, exchangeCount);
    } else if (mode === "LEARN") {
      const weakAreas = mastery?.subMasteries
        ?.sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((s) => `${s.name} (${Math.round(s.score)}%)`)
        .join(", ") ?? "";
      systemPrompt = buildLearnPrompt(
        concept.title,
        concept.lessonMarkdown,
        mastery?.score ?? 0,
        weakAreas,
        exchangeCount
      );
    } else {
      const daysSince = mastery
        ? (Date.now() - mastery.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const subMasteries = mastery?.subMasteries?.map((s) => ({
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

  // Stream the response
  const stream = await streamChatResponse(systemPrompt, messages);

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
  const subMasteries = parseSubMasteryTags(fullText);
  const legacyMastery = parseMasteryTag(fullText);

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
    // Fallback for legacy single mastery tag
    await prisma.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {
        score: legacyMastery.score,
        decayRate: legacyMastery.decayRate,
        lastReviewedAt: new Date(),
        reviewCount: { increment: 1 },
      },
      create: {
        userId,
        conceptId,
        score: legacyMastery.score,
        decayRate: legacyMastery.decayRate,
        lastReviewedAt: new Date(),
        reviewCount: 1,
      },
    });
  }
}
