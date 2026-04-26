import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseRoundResult } from "@/lib/claude";
import { streamChatResponse, LlmConfig } from "@/lib/llm";
import { decrypt } from "@/lib/crypto";
import { buildRoundPrompt } from "@/lib/prompts";
import { advance, drop, nextDueAt as computeNextDueAt, FacetState } from "@/lib/levels";
import { FacetLevel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const LEVEL_RANK: Record<FacetLevel, number> = {
  NOVICE: 0,
  APPRENTICE: 1,
  JOURNEYMAN: 2,
  EXPERT: 3,
};

type ResolvedFacet = FacetState & {
  name: string;
  nextDueAt: Date;
};

// Sort weakest-first: lowest level, then lowest expertStage (within Expert),
// then most-overdue first. Returns null if no facets are due.
function pickWeakestOverdue(facets: ResolvedFacet[], now: Date): ResolvedFacet | null {
  const overdue = facets.filter((f) => f.nextDueAt <= now);
  if (overdue.length === 0) return null;
  overdue.sort((a, b) => {
    const lr = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (lr !== 0) return lr;
    if (a.level === FacetLevel.EXPERT) {
      const sd = a.expertStage - b.expertStage;
      if (sd !== 0) return sd;
    }
    return a.nextDueAt.getTime() - b.nextDueAt.getTime();
  });
  return overdue[0];
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const userId = session.user.id;
  const { conceptId, sessionId, facetName: requestedFacetName, userMessage } = await req.json();

  if (!conceptId || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (typeof userMessage !== "string" || userMessage.length > 5000) {
    return NextResponse.json({ error: "Message too long (max 5000 chars)" }, { status: 400 });
  }

  // Rate limit: max 30 user messages per 5 min across all sessions
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

  // Strip any tag-shaped content the user might inject so they can't fake outcomes
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

  // Concepts imported before Phase 2.0 have empty facets[]; refuse rather than
  // silently picking nothing. User must re-import with the updated generator.
  if (concept.facets.length === 0) {
    return NextResponse.json(
      {
        error:
          "This concept has no facets defined yet. Re-import the curriculum with the updated generator prompt.",
      },
      { status: 400 }
    );
  }

  // Get-or-create the ConceptMastery shell for this user/concept
  const conceptMastery = await prisma.conceptMastery.upsert({
    where: { userId_conceptId: { userId, conceptId } },
    update: {},
    create: { userId, conceptId },
    include: { subMasteries: true },
  });

  if (conceptMastery.mastered) {
    return NextResponse.json(
      { error: "This concept is already Mastered — no further rounds." },
      { status: 400 }
    );
  }

  // Resolve the active facet
  let activeFacetName: string;
  if (sessionId) {
    if (!requestedFacetName || typeof requestedFacetName !== "string") {
      return NextResponse.json(
        { error: "facetName required when continuing a round" },
        { status: 400 }
      );
    }
    if (!concept.facets.includes(requestedFacetName)) {
      return NextResponse.json(
        { error: "facetName is not a facet of this concept" },
        { status: 400 }
      );
    }
    activeFacetName = requestedFacetName;
  } else {
    // New round: pick the weakest overdue facet
    type Sub = (typeof conceptMastery.subMasteries)[number];
    const subByName = new Map<string, Sub>(
      conceptMastery.subMasteries.map((s: Sub) => [s.name, s])
    );
    const facetStates: ResolvedFacet[] = concept.facets.map((name: string) => {
      const sub = subByName.get(name);
      return {
        name,
        level: sub?.level ?? FacetLevel.NOVICE,
        expertStage: sub?.expertStage ?? 0,
        nextDueAt: sub?.nextDueAt ?? new Date(),
      };
    });
    const weakest = pickWeakestOverdue(facetStates, new Date());
    if (!weakest) {
      return NextResponse.json(
        { error: "No facets are due for review on this concept right now." },
        { status: 400 }
      );
    }
    activeFacetName = weakest.name;
  }

  // Get-or-create the ChatSession (mode=ROUND)
  let chatSession;
  if (sessionId) {
    chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chatSession || chatSession.userId !== userId || chatSession.mode !== "ROUND") {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
    if (chatSession.finishedAt) {
      return NextResponse.json({ error: "Session has already concluded" }, { status: 400 });
    }
  } else {
    chatSession = await prisma.chatSession.create({
      data: { userId, conceptId, mode: "ROUND" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Save the user message before building history so it appears in conversation
  await prisma.chatMessage.create({
    data: { chatSessionId: chatSession.id, role: "user", content: sanitizedMessage },
  });

  // Build conversation for the LLM
  const messages = chatSession.messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messages.push({ role: "user", content: sanitizedMessage });

  // Current facet state — defaults to Novice/0 if no SubConceptMastery row yet
  const facetMastery = conceptMastery.subMasteries.find(
    (s: { name: string }) => s.name === activeFacetName
  );
  const currentLevel = facetMastery?.level ?? FacetLevel.NOVICE;
  const currentExpertStage = facetMastery?.expertStage ?? 0;

  // Count student responses received (excludes the [START ROUND] trigger).
  // The round prompt's pacing nudges fire at >= 2 (lean resolve) and >= 3 (must resolve).
  const exchangeCount = messages.filter(
    (m) => m.role === "user" && !m.content.startsWith("[START ROUND]")
  ).length;

  const systemPrompt = buildRoundPrompt({
    conceptTitle: concept.title,
    facetName: activeFacetName,
    currentLevel,
    currentExpertStage,
    lessonMarkdown: concept.lessonMarkdown,
    exchangeCount,
  });

  // Resolve LLM provider + key
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

  // Stream + tee for collector
  const stream = await streamChatResponse(systemPrompt, messages, llmConfig);
  const [clientStream, collectorStream] = stream.tee();

  collectAndSaveRound(
    collectorStream,
    chatSession.id,
    conceptMastery.id,
    activeFacetName,
    currentLevel,
    currentExpertStage
  ).catch(console.error);

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": chatSession.id,
      "X-Facet-Name": activeFacetName,
    },
  });
}

async function collectAndSaveRound(
  stream: ReadableStream<Uint8Array>,
  chatSessionId: string,
  conceptMasteryId: string,
  facetName: string,
  currentLevel: FacetLevel,
  currentExpertStage: number
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

  // Save the assistant message regardless of whether the round resolved
  await prisma.chatMessage.create({
    data: { chatSessionId, role: "assistant", content: fullText },
  });

  const result = parseRoundResult(fullText);
  if (!result) return; // Round still in progress — leave session open

  // Defensive: Claude should emit name="<activeFacetName>". If it drifted,
  // log and refuse to update mastery rather than corrupting the wrong facet.
  if (result.name !== facetName) {
    console.warn(
      `Round result name "${result.name}" does not match active facet "${facetName}"; ignoring level update.`
    );
    return;
  }

  const newState =
    result.outcome === "advance"
      ? advance({ level: currentLevel, expertStage: currentExpertStage })
      : drop({ level: currentLevel, expertStage: currentExpertStage });

  const now = new Date();
  const nextDue = computeNextDueAt(newState, now);

  await prisma.subConceptMastery.upsert({
    where: { conceptMasteryId_name: { conceptMasteryId, name: facetName } },
    update: {
      level: newState.level,
      expertStage: newState.expertStage,
      lastReviewedAt: now,
      nextDueAt: nextDue,
    },
    create: {
      conceptMasteryId,
      name: facetName,
      level: newState.level,
      expertStage: newState.expertStage,
      lastReviewedAt: now,
      nextDueAt: nextDue,
    },
  });

  await prisma.conceptMastery.update({
    where: { id: conceptMasteryId },
    data: { lastReviewedAt: now, reviewCount: { increment: 1 } },
  });

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { finishedAt: now },
  });
}
