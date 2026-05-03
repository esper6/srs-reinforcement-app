import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { streamChatResponse, LlmConfig } from "@/lib/llm";
import { decrypt } from "@/lib/crypto";
import { buildExtraCreditPrompt } from "@/lib/prompts";
import { NextRequest, NextResponse } from "next/server";

// Extra-credit-only chat endpoint. The rounds redesign moved scored interactions
// to /api/round and /api/synthesis; this route exists solely to power the
// post-round Extra Credit conversation surface, where the user can dig into a
// concept without affecting mastery.

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const userId = session.user.id;
  const { conceptId, sessionId, userMessage, precedingSessionId } = await req.json();

  if (!conceptId || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (typeof userMessage !== "string" || userMessage.length > 5000) {
    return NextResponse.json({ error: "Message too long (max 5000 chars)" }, { status: 400 });
  }
  if (precedingSessionId != null && typeof precedingSessionId !== "string") {
    return NextResponse.json({ error: "Invalid precedingSessionId" }, { status: 400 });
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

  // Strip any tag-shaped content from user input — Extra Credit doesn't score,
  // but we still defend against injected fake tags drifting into other contexts.
  const sanitizedMessage = userMessage
    .replace(/<\/?round_result[^>]*\/?>/gi, "")
    .replace(/<\/?synthesis_result[^>]*\/?>/gi, "")
    .replace(/<\/?sub_mastery[^>]*\/?>/gi, "")
    .replace(/<\/?mastery[^>]*\/?>/gi, "");

  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { id: true, title: true, lessonMarkdown: true },
  });
  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  let chatSession;
  if (sessionId) {
    chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chatSession || chatSession.userId !== userId || chatSession.mode !== "EXTRA_CREDIT") {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
  } else {
    chatSession = await prisma.chatSession.create({
      data: { userId, conceptId, mode: "EXTRA_CREDIT" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  await prisma.chatMessage.create({
    data: { chatSessionId: chatSession.id, role: "user", content: sanitizedMessage },
  });

  // Prefix the LLM context with the round transcript when EC is bolted onto a
  // just-finished round. We don't persist these as EC ChatMessages — they
  // remain owned by the ROUND session. Strips the [START ROUND] trigger and
  // any <round_result/> tag content so the EC system prompt isn't confused.
  const precedingMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (precedingSessionId) {
    const preceding = await prisma.chatSession.findUnique({
      where: { id: precedingSessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (
      preceding &&
      preceding.userId === userId &&
      preceding.conceptId === conceptId &&
      preceding.mode === "ROUND"
    ) {
      for (const m of preceding.messages) {
        if (m.role === "user" && m.content.startsWith("[START ROUND]")) continue;
        const cleaned = m.content
          .replace(/<round_result\s+name="[\s\S]*?"\s+outcome="(advance|drop)"\s*\/>/gi, "")
          .trim();
        if (!cleaned) continue;
        precedingMessages.push({
          role: m.role as "user" | "assistant",
          content: cleaned,
        });
      }
    }
  }

  const messages = [
    ...precedingMessages,
    ...chatSession.messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: sanitizedMessage },
  ];

  const systemPrompt = buildExtraCreditPrompt(concept.title, concept.lessonMarkdown);

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
        { error: `No API key configured for ${user.preferredProvider}. Add one in Settings → API Keys.` },
        { status: 400 }
      );
    }
    llmConfig = { provider: user.preferredProvider, apiKey: decrypt(providerKey.encryptedKey) };
  }

  const stream = await streamChatResponse(systemPrompt, messages, llmConfig);
  const [clientStream, collectorStream] = stream.tee();

  collectAndSaveExtraCredit(collectorStream, chatSession.id).catch(console.error);

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": chatSession.id,
    },
  });
  } catch (err) {
    console.error("[/api/chat] uncaught error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}

async function collectAndSaveExtraCredit(
  stream: ReadableStream<Uint8Array>,
  chatSessionId: string
) {
  const decoder = new TextDecoder();
  let fullText = "";

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
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
}
