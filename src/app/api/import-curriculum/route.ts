import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface VocabInput {
  Term: string;
  Definition: string;
}

interface ConceptInput {
  Title: string;
  Description: string;
  LessonMarkdown: string;
  Order: number;
  Prompts: unknown[];
  Vocab?: VocabInput[];
}

interface SectionInput {
  Name: string;
  Concepts: ConceptInput[];
}

interface CurriculumInput {
  Name: string;
  Slug: string;
  Description: string;
  Language?: string;
  IconClass?: string;
  Order?: number;
  Sections: SectionInput[];
}

// Size limits
const MAX_SECTIONS = 10;
const MAX_CONCEPTS_PER_SECTION = 15;
const MAX_LESSON_CHARS = 15000;
const MAX_VOCAB_PER_CONCEPT = 20;
const MAX_TERM_CHARS = 200;
const MAX_DEFINITION_CHARS = 1000;
const MAX_NAME_CHARS = 200;
const MAX_SLUG_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;

// Strip HTML tags from text fields to prevent stored XSS
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

function validateCurriculum(data: unknown): { valid: true; curriculum: CurriculumInput } | { valid: false; error: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Input must be a JSON object" };
  }

  const c = data as Record<string, unknown>;

  if (!c.Name || typeof c.Name !== "string") {
    return { valid: false, error: 'Missing or invalid "Name" field (string required)' };
  }
  if ((c.Name as string).length > MAX_NAME_CHARS) {
    return { valid: false, error: `"Name" is too long (max ${MAX_NAME_CHARS} chars)` };
  }
  if (!c.Slug || typeof c.Slug !== "string") {
    return { valid: false, error: 'Missing or invalid "Slug" field (string required)' };
  }
  if ((c.Slug as string).length > MAX_SLUG_CHARS) {
    return { valid: false, error: `"Slug" is too long (max ${MAX_SLUG_CHARS} chars)` };
  }
  if (!/^[a-z0-9-]+$/.test(c.Slug as string)) {
    return { valid: false, error: '"Slug" must be lowercase letters, numbers, and hyphens only' };
  }
  if (!c.Description || typeof c.Description !== "string") {
    return { valid: false, error: 'Missing or invalid "Description" field (string required)' };
  }
  if ((c.Description as string).length > MAX_DESCRIPTION_CHARS) {
    return { valid: false, error: `"Description" is too long (max ${MAX_DESCRIPTION_CHARS} chars)` };
  }
  if (!Array.isArray(c.Sections) || c.Sections.length === 0) {
    return { valid: false, error: '"Sections" must be a non-empty array' };
  }
  if ((c.Sections as unknown[]).length > MAX_SECTIONS) {
    return { valid: false, error: `Too many sections (max ${MAX_SECTIONS})` };
  }

  for (let i = 0; i < (c.Sections as unknown[]).length; i++) {
    const section = (c.Sections as Record<string, unknown>[])[i];
    if (!section.Name || typeof section.Name !== "string") {
      return { valid: false, error: `Section ${i + 1}: Missing or invalid "Name"` };
    }
    if ((section.Name as string).length > MAX_NAME_CHARS) {
      return { valid: false, error: `Section "${section.Name}": Name too long (max ${MAX_NAME_CHARS} chars)` };
    }
    if (!Array.isArray(section.Concepts) || (section.Concepts as unknown[]).length === 0) {
      return { valid: false, error: `Section "${section.Name}": "Concepts" must be a non-empty array` };
    }
    if ((section.Concepts as unknown[]).length > MAX_CONCEPTS_PER_SECTION) {
      return { valid: false, error: `Section "${section.Name}": Too many concepts (max ${MAX_CONCEPTS_PER_SECTION})` };
    }

    for (let j = 0; j < (section.Concepts as unknown[]).length; j++) {
      const concept = (section.Concepts as Record<string, unknown>[])[j];
      if (!concept.Title || typeof concept.Title !== "string") {
        return { valid: false, error: `Section "${section.Name}", Concept ${j + 1}: Missing or invalid "Title"` };
      }
      if ((concept.Title as string).length > MAX_NAME_CHARS) {
        return { valid: false, error: `Concept "${concept.Title}": Title too long (max ${MAX_NAME_CHARS} chars)` };
      }
      if (!concept.LessonMarkdown || typeof concept.LessonMarkdown !== "string") {
        return { valid: false, error: `Concept "${concept.Title}": Missing or invalid "LessonMarkdown"` };
      }
      if ((concept.LessonMarkdown as string).length < 100) {
        return { valid: false, error: `Concept "${concept.Title}": LessonMarkdown is too short (${(concept.LessonMarkdown as string).length} chars, minimum 100)` };
      }
      if ((concept.LessonMarkdown as string).length > MAX_LESSON_CHARS) {
        return { valid: false, error: `Concept "${concept.Title}": LessonMarkdown is too long (${(concept.LessonMarkdown as string).length} chars, max ${MAX_LESSON_CHARS})` };
      }
      // Validate optional Vocab array
      if (concept.Vocab !== undefined) {
        if (!Array.isArray(concept.Vocab)) {
          return { valid: false, error: `Concept "${concept.Title}": "Vocab" must be an array` };
        }
        if ((concept.Vocab as unknown[]).length > MAX_VOCAB_PER_CONCEPT) {
          return { valid: false, error: `Concept "${concept.Title}": Too many vocab words (max ${MAX_VOCAB_PER_CONCEPT})` };
        }
        for (let k = 0; k < (concept.Vocab as unknown[]).length; k++) {
          const v = (concept.Vocab as Record<string, unknown>[])[k];
          if (!v.Term || typeof v.Term !== "string") {
            return { valid: false, error: `Concept "${concept.Title}", Vocab ${k + 1}: Missing or invalid "Term"` };
          }
          if ((v.Term as string).length > MAX_TERM_CHARS) {
            return { valid: false, error: `Concept "${concept.Title}", Vocab "${v.Term}": Term too long (max ${MAX_TERM_CHARS} chars)` };
          }
          if (!v.Definition || typeof v.Definition !== "string") {
            return { valid: false, error: `Concept "${concept.Title}", Vocab "${v.Term}": Missing or invalid "Definition"` };
          }
          if ((v.Definition as string).length > MAX_DEFINITION_CHARS) {
            return { valid: false, error: `Concept "${concept.Title}", Vocab "${v.Term}": Definition too long (max ${MAX_DEFINITION_CHARS} chars)` };
          }
        }
      }
    }
  }

  return { valid: true, curriculum: data as CurriculumInput };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.approved) {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  // Guard against oversized payloads (2MB limit)
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large (max 2MB)" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateCurriculum(body);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { curriculum: cur } = result;

  try {
    // Check if curriculum with this slug already exists
    const existing = await prisma.curriculum.findUnique({
      where: { slug: cur.Slug },
      include: {
        sections: {
          include: {
            concepts: {
              include: { masteries: { select: { id: true } } },
            },
          },
        },
      },
    });

    if (existing) {
      // Check if any concepts have mastery data
      const hasProgress = existing.sections.some((s: { concepts: Array<{ masteries: Array<{ id: string }> }> }) =>
        s.concepts.some((c: { masteries: Array<{ id: string }> }) => c.masteries.length > 0)
      );

      if (hasProgress) {
        return NextResponse.json(
          {
            error: `A curriculum with slug "${cur.Slug}" already exists and has student progress. Choose a different slug or delete the existing curriculum first.`,
          },
          { status: 409 }
        );
      }

      // No progress — safe to delete and recreate
      await prisma.section.deleteMany({
        where: { curriculumId: existing.id },
      });
    }

    // Sanitize all text fields before writing to DB
    const safeName = stripHtml(cur.Name).trim();
    const safeDescription = stripHtml(cur.Description).trim();

    // Upsert the curriculum
    const curriculum = await prisma.curriculum.upsert({
      where: { slug: cur.Slug },
      update: {
        name: safeName,
        description: safeDescription,
        language: cur.Language ?? "",
        iconClass: cur.IconClass ?? "",
        order: cur.Order ?? 0,
      },
      create: {
        name: safeName,
        slug: cur.Slug,
        description: safeDescription,
        language: cur.Language ?? "",
        iconClass: cur.IconClass ?? "",
        order: cur.Order ?? 0,
      },
    });

    // Create sections and concepts
    let totalConcepts = 0;
    let totalVocab = 0;
    for (const [sIdx, sec] of cur.Sections.entries()) {
      const section = await prisma.section.create({
        data: {
          name: stripHtml(sec.Name).trim(),
          order: sIdx,
          curriculumId: curriculum.id,
        },
      });

      for (const concept of sec.Concepts) {
        const newConcept = await prisma.concept.create({
          data: {
            title: stripHtml(concept.Title).trim(),
            description: stripHtml(concept.Description || "").trim(),
            lessonMarkdown: concept.LessonMarkdown, // Markdown kept intact — rendered safely by ReactMarkdown
            order: concept.Order || 0,
            sectionId: section.id,
          },
        });
        totalConcepts++;

        // Create vocab words if present
        if (concept.Vocab && concept.Vocab.length > 0) {
          for (const [vIdx, vocab] of concept.Vocab.entries()) {
            await prisma.vocabWord.create({
              data: {
                conceptId: newConcept.id,
                term: stripHtml(vocab.Term).trim(),
                definition: stripHtml(vocab.Definition).trim(),
                order: vIdx,
              },
            });
          }
          totalVocab += concept.Vocab.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      name: cur.Name,
      slug: cur.Slug,
      sections: cur.Sections.length,
      concepts: totalConcepts,
      vocab: totalVocab,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import curriculum. Check the server logs." },
      { status: 500 }
    );
  }
}
