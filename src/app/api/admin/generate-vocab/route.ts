import { getServerSession } from "next-auth";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { singleChatResponse, LlmConfig } from "@/lib/llm";
import { NextRequest, NextResponse } from "next/server";

const VOCAB_PROMPT = `You are a vocabulary extractor. Given a lesson's title and markdown content, extract the 5-10 most important terms a student should memorize.

For each term, provide a concise definition (1-2 sentences) that is self-contained and captures the core meaning.

Rules:
- Only extract terms that appear in or are directly implied by the lesson content
- Definitions should be concise enough to recall in a flashcard setting
- Prefer specific, technical terms over generic ones
- Don't include the concept title itself as a term

Respond with ONLY a JSON array (no other text):
[{"Term": "term here", "Definition": "definition here"}, ...]`;

// GET: list all concepts with their vocab status
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slug = req.nextUrl.searchParams.get("curriculum");

  const curricula = await prisma.curriculum.findMany({
    where: slug ? { slug } : undefined,
    orderBy: { order: "asc" },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          concepts: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              _count: { select: { vocabWords: true } },
            },
          },
        },
      },
    },
  });

  type Curriculum = (typeof curricula)[number];
  type Section = Curriculum["sections"][number];
  type Concept = Section["concepts"][number];

  const result = curricula.map((c: Curriculum) => ({
    slug: c.slug,
    name: c.name,
    sections: c.sections.map((s: Section) => ({
      name: s.name,
      concepts: s.concepts.map((con: Concept) => ({
        id: con.id,
        title: con.title,
        vocabCount: con._count.vocabWords,
      })),
    })),
  }));

  return NextResponse.json(result);
}

// POST: generate vocab for a single concept
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { conceptId } = (await req.json()) as { conceptId: string };
  if (!conceptId) {
    return NextResponse.json({ error: "Missing conceptId" }, { status: 400 });
  }

  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { id: true, title: true, lessonMarkdown: true },
  });
  if (!concept) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  // Get admin's LLM config
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { preferredProvider: true, apiKeys: true },
  });

  const providerKey = user.apiKeys.find(
    (k: { provider: string }) => k.provider === user.preferredProvider
  );
  if (!providerKey) {
    return NextResponse.json(
      { error: `No API key for ${user.preferredProvider}. Add one in Settings.` },
      { status: 400 }
    );
  }

  const llmConfig: LlmConfig = {
    provider: user.preferredProvider,
    apiKey: decrypt(providerKey.encryptedKey),
  };

  const userMessage = `Title: "${concept.title}"\n\nLesson content:\n${concept.lessonMarkdown}`;

  try {
    console.log(`Generating vocab for "${concept.title}" via ${llmConfig.provider}...`);
    const response = await singleChatResponse(VOCAB_PROMPT, userMessage, llmConfig, true, 1500);
    console.log(`LLM response (${response.length} chars):`, response.slice(0, 300));
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Vocab generation: no JSON array found in full response:", response);
      return NextResponse.json({ error: "LLM did not return valid JSON array" }, { status: 500 });
    }

    const vocab = JSON.parse(jsonMatch[0]) as { Term: string; Definition: string }[];

    // Validate
    const valid = vocab
      .filter((v) => v.Term && typeof v.Term === "string" && v.Definition && typeof v.Definition === "string")
      .slice(0, 15)
      .map((v) => ({ Term: v.Term.trim(), Definition: v.Definition.trim() }));

    // Dedup: find terms that already exist in other concepts in the same curriculum
    const conceptWithCurriculum = await prisma.concept.findUnique({
      where: { id: conceptId },
      select: { section: { select: { curriculumId: true } } },
    });
    const curriculumId = conceptWithCurriculum?.section.curriculumId;

    let existingTerms: Set<string> = new Set();
    if (curriculumId) {
      const existing = await prisma.vocabWord.findMany({
        where: {
          concept: { section: { curriculumId } },
          NOT: { conceptId }, // exclude this concept's own vocab
        },
        select: { term: true },
      });
      existingTerms = new Set(existing.map((e: { term: string }) => e.term.toLowerCase()));
    }

    const deduped = valid.filter((v) => !existingTerms.has(v.Term.toLowerCase()));
    const duplicateCount = valid.length - deduped.length;

    return NextResponse.json({
      conceptId: concept.id,
      conceptTitle: concept.title,
      vocab: deduped,
      duplicatesRemoved: duplicateCount,
    });
  } catch (error) {
    console.error("Vocab generation error:", error);
    return NextResponse.json({ error: "Failed to generate vocab" }, { status: 500 });
  }
}

// PUT: save generated vocab for a concept (after admin review)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { conceptId, vocab } = (await req.json()) as {
    conceptId: string;
    vocab: { Term: string; Definition: string }[];
  };

  if (!conceptId || !Array.isArray(vocab)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Delete existing vocab for this concept first
  await prisma.vocabWord.deleteMany({ where: { conceptId } });

  // Create new vocab
  for (const [idx, v] of vocab.entries()) {
    await prisma.vocabWord.create({
      data: {
        conceptId,
        term: v.Term.trim(),
        definition: v.Definition.trim(),
        order: idx,
      },
    });
  }

  return NextResponse.json({ success: true, count: vocab.length });
}
