"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ConceptPreview {
  Title: string;
  Description: string;
  LessonMarkdown: string;
  Facets?: string[];
  Vocab?: { Term: string; Definition: string }[];
}

interface SectionPreview {
  Name: string;
  Concepts: ConceptPreview[];
}

interface CurriculumPreview {
  Name: string;
  Slug: string;
  Description: string;
  Sections: SectionPreview[];
}

type Step = "paste" | "preview" | "importing" | "done";

const GENERATOR_PROMPT = `# FILL THIS OUT

**What topic do you want to learn?**
(e.g. "Kubernetes", "Music Theory", "Graph Algorithms", "How the Internet Works", "Organic Chemistry", "Personal Finance & Investing", "U.S. Constitutional Law", "Machine Learning Fundamentals", "Screenwriting Structure", "Poker Strategy & Game Theory", "Microprocessor Architecture", "Behavioral Psychology", "SQL & Database Design")


**How deep should it go?**
(e.g. "beginner intro", "intermediate for someone with basic knowledge", "practitioner-level deep dive")


**Any specific areas you want covered?**
(Optional. e.g. "focus on security and networking", "skip the math, focus on intuition", "include real-world trade-offs")


**Any source material?**
(Optional. Paste URLs, article titles, book names, course syllabi, or notes. The AI will use these to inform the curriculum.)


---
# ⚠️ DO NOT EDIT BELOW THIS LINE ⚠️
# Everything below is instructions for the AI.
---

You are a curriculum designer for a Socratic learning app. The app works like this: an AI tutor conducts a conversation with a student about each concept — asking open-ended questions, probing their understanding, and scoring them on 3-5 "facets" (sub-topics) per concept. The AI's only reference material is the lesson markdown you write. There are no flashcards, no multiple choice — just conversation.

Your job: generate a complete curriculum as a single JSON object based on the questionnaire answers above.

## Output format

Output ONLY valid JSON. No commentary before or after. Keys are PascalCase. The output is a single object (not an array).

\`\`\`json
{
  "Name": "Curriculum Name",
  "Slug": "curriculum-slug",
  "Description": "One-line description of the subject area",
  "Language": "",
  "IconClass": "",
  "Order": 1,
  "Sections": [
    {
      "Name": "Section Name",
      "Concepts": [
        {
          "Title": "Concept Title",
          "Description": "One-line concept description",
          "LessonMarkdown": "### Concept Title\\n\\nFull lesson content here...",
          "Facets": ["First Facet Name", "Second Facet Name", "Third Facet Name"],
          "Order": 1,
          "Prompts": [],
          "Vocab": [
            {"Term": "key term", "Definition": "concise definition (1-2 sentences)"},
            {"Term": "another term", "Definition": "its meaning"}
          ]
        }
      ]
    }
  ]
}
\`\`\`

## Curriculum structure rules

- **4-6 sections** per curriculum, ordered by logical progression (fundamentals first, advanced last)
- **5 concepts** per section
- **Slug**: lowercase, hyphens, URL-safe, unique (e.g. \`graph-algorithms\`)
- **Order**: sequential integers starting at 1 for both sections and concepts
- **Prompts**: always an empty array \`[]\`
- **Vocab**: array of 5-10 key terms per concept. Each has "Term" and "Definition". Definitions should be concise (1-2 sentences), self-contained, and capture the core meaning. These are used for flashcard drills separate from the Socratic assessment.
- **Facets**: array of 3-5 strings naming the facets in this concept. MUST exactly match the \`####\` subheading text in the LessonMarkdown — one entry per subheading, in the same order, character-for-character. The app uses these names as stable identifiers in the spaced-repetition engine; renaming them later breaks user progress on that concept.
- **Language** and **IconClass**: always empty strings \`""\`
- Sections should build on each other — earlier sections establish vocabulary that later sections assume
- No overlapping concepts within the same section — each concept owns its territory

## Lesson writing rules (CRITICAL)

The \`LessonMarkdown\` field is the most important part. The AI tutor uses it as its ONLY reference when assessing students. A bad lesson produces a bad assessment.

### Structure

Each lesson MUST have **3-5 clearly delineated sections**, each one mapping to a distinct assessable facet. Use \`####\` subheadings to separate them. The \`Facets\` JSON array on the concept MUST list these subheading titles exactly, in the same order — they are the contract between the lesson and the spaced-repetition engine.

For each facet section, cover **four levels of depth**:
1. **What** — Define it clearly
2. **Why** — Why does it matter? What problem does it solve?
3. **How** — How does it actually work? What's the mechanism?
4. **When** — When should you use it vs. alternatives? What are the trade-offs?

### Style

- **Length**: 800-1500 words per lesson
- **Tone**: Clear, direct, slightly conversational. Not textbook-dry, not overly casual
- Write **narrative**, not bullet-point glossaries. The AI needs connective tissue to have a real conversation
- Use **concrete examples** and analogies
- Use **contrast**: "X is like Y, but differs because Z"
- Connect ideas: "This matters because...", "The trade-off is...", "In practice..."

### What NOT to do

- Do NOT write lists of definitions — the AI can only quiz recall, not understanding
- Do NOT make facets overlap with other concepts in the same section
- Do NOT write concepts so narrow they have only 1-2 facets (merge them into a bigger concept)
- Do NOT write concepts so broad they need 8+ facets (split them)
- Do NOT include code examples longer than 5 lines — keep it conceptual

### The scoping test

For each concept, ask: "Could a tutor have a meaningful 10-minute conversation assessing this?" If the answer is no (too narrow or too broad), rescope it.

## Agentic Workflow (Claude Code, Cursor, etc.)

If you have file-writing tools available, **use the chunked workflow** below instead of generating the whole curriculum in one response. Much faster for the user (visible progress, parallelizable) and salvageable if interrupted.

### Step 1 — Outline file
Write the outline to \`curriculum.json\` first. The outline includes EVERYTHING except \`LessonMarkdown\`. For each concept, leave \`LessonMarkdown\` as an empty string \`""\` and fill all other fields (Title, Description, Facets, Order, Prompts, Vocab). This is small (a few KB). Tell the user "outline written, generating lessons now" so they see progress.

### Step 2 — Fill lessons one concept at a time
For each concept in the outline, generate the \`LessonMarkdown\` (800-1500 words, with \`####\` subheadings exactly matching that concept's \`Facets\` array, in order). Update \`curriculum.json\` in place by reading it, replacing that concept's \`LessonMarkdown\`, and writing it back. Print a one-line progress note after each concept. If you can parallelize, do — concepts are independent.

### Step 3 — Validate
After all lessons are filled, verify the JSON parses cleanly, every \`Facets\` array length is 3-5 with entries matching the \`####\` subheading text character-for-character, and no \`LessonMarkdown\` is still empty. Tell the user \`curriculum.json is ready — paste it into the /import page\` and stop.

### When NOT to use chunked workflow
- The user explicitly said one-shot or one-response mode
- The curriculum is 1-2 concepts total (overhead with no benefit)
- You have no file-writing tools available

## Now generate the curriculum

Generate the full curriculum JSON for the topic above. Remember:
- 4-6 sections, 5 concepts each
- Every lesson 800-1500 words with 3-5 facet sections (using \`####\` subheadings)
- Every concept's \`Facets\` array must list those subheading titles exactly, in order
- 5-10 vocab terms per concept with concise definitions
- Narrative style, not bullet lists
- If you have file tools, use the **Agentic Workflow** above
- If not (web LLM mode), output ONLY the JSON, nothing else`;

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("paste");
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<CurriculumPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; slug: string; sections: number; concepts: number } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopyPrompt() {
    navigator.clipboard.writeText(GENERATOR_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleParse() {
    setParseError(null);
    setImportError(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.Name || !parsed.Slug || !parsed.Sections) {
        setParseError('JSON must have "Name", "Slug", and "Sections" fields. Make sure keys are PascalCase.');
        return;
      }
      setPreview(parsed);
      setStep("preview");
    } catch {
      setParseError("Invalid JSON. Make sure you copied the entire output from the AI.");
    }
  }

  async function handleImport() {
    if (!preview) return;
    setStep("importing");
    setImportError(null);

    try {
      const res = await fetch("/api/import-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Import failed");
        setStep("preview");
        return;
      }

      setResult(data);
      setStep("done");
    } catch {
      setImportError("Network error. Try again.");
      setStep("preview");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] mb-2 glow-cyan tracking-wide">
        Import Curriculum
      </h1>
      <p className="text-[var(--foreground)]/60 text-sm mb-6">
        Create a curriculum on any topic using AI, then import it here.
      </p>

      {/* Step 1: Paste JSON */}
      {step === "paste" && (
        <div>
          {/* Instructions */}
          <div className="mb-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/30 text-[var(--neon-cyan)] text-xs flex items-center justify-center font-[family-name:var(--font-share-tech-mono)]">1</span>
              <div className="text-sm">
                <span className="text-[var(--foreground)]/90">Copy the generator prompt</span>
                <span className="text-[var(--foreground)]/40"> — it has a short questionnaire at the top and instructions for the AI below</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/30 text-[var(--neon-cyan)] text-xs flex items-center justify-center font-[family-name:var(--font-share-tech-mono)]">2</span>
              <div className="text-sm">
                <span className="text-[var(--foreground)]/90">Paste it into any LLM</span>
                <span className="text-[var(--foreground)]/40"> (Claude.ai, ChatGPT, etc.), fill in the topic &amp; depth, and send</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/30 text-[var(--neon-cyan)] text-xs flex items-center justify-center font-[family-name:var(--font-share-tech-mono)]">3</span>
              <div className="text-sm">
                <span className="text-[var(--foreground)]/90">Paste the JSON output below</span>
                <span className="text-[var(--foreground)]/40"> — preview it, then import</span>
              </div>
            </div>
          </div>

          {/* Generator prompt toggle */}
          <div className="mb-5">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="flex items-center gap-2 text-sm text-[var(--neon-magenta)] hover:text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)] transition-colors duration-200"
            >
              <span className="transition-transform duration-200" style={{ display: "inline-block", transform: showPrompt ? "rotate(90deg)" : "rotate(0deg)" }}>&#x25B6;</span>
              {showPrompt ? "Hide generator prompt" : "Show generator prompt"}
            </button>

            {showPrompt && (
              <div className="mt-3 relative">
                <button
                  onClick={handleCopyPrompt}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-[var(--surface)] border border-[var(--neon-magenta)]/30 text-[var(--neon-magenta)] rounded text-xs font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-magenta)]/10 hover:border-[var(--neon-magenta)]/50 transition-all duration-200 z-10"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <pre className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-4 pr-24 text-[var(--foreground)]/70 text-xs font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                  {GENERATOR_PROMPT}
                </pre>
              </div>
            )}
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='Paste the curriculum JSON here...'
            className="w-full h-80 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-4 text-[var(--foreground)] font-mono text-sm resize-none focus:outline-none focus:border-[var(--neon-cyan)]/50 placeholder:text-[var(--foreground)]/30"
          />
          {parseError && (
            <div className="mt-3 p-3 bg-red-900/30 border border-red-500/40 rounded-lg text-red-300 text-sm">
              {parseError}
            </div>
          )}
          <button
            onClick={handleParse}
            disabled={!jsonText.trim()}
            className="mt-4 px-6 py-2 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Preview
          </button>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && preview && (
        <div>
          <div className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-5 mb-4">
            <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg text-[var(--neon-cyan)] mb-1">
              {preview.Name}
            </h2>
            <p className="text-[var(--foreground)]/50 text-xs font-mono mb-2">/{preview.Slug}</p>
            <p className="text-[var(--foreground)]/70 text-sm mb-4">{preview.Description}</p>

            <div className="space-y-3">
              {preview.Sections.map((section, sIdx) => (
                <div key={sIdx} className="border-l-2 border-[var(--neon-magenta)]/40 pl-4">
                  <h3 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--neon-magenta)] mb-1">
                    {section.Name}
                  </h3>
                  <ul className="space-y-1">
                    {section.Concepts.map((concept, cIdx) => (
                      <li key={cIdx} className="text-sm text-[var(--foreground)]/60 flex items-start gap-2">
                        <span className="text-[var(--neon-green)]/40 mt-0.5">&#x25B8;</span>
                        <div>
                          <span className="text-[var(--foreground)]/80">{concept.Title}</span>
                          {concept.LessonMarkdown && (
                            <span className="text-[var(--foreground)]/30 ml-2 text-xs">
                              {concept.LessonMarkdown.length.toLocaleString()} chars
                              {concept.Facets && concept.Facets.length > 0 && (
                                <> &middot; {concept.Facets.length} facets</>
                              )}
                              {concept.Vocab && concept.Vocab.length > 0 && (
                                <> &middot; {concept.Vocab.length} vocab</>
                              )}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {importError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/40 rounded-lg text-red-300 text-sm">
              {importError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setImportError(null);
                setParseError(null);
                setStep("paste");
              }}
              className="px-5 py-2 bg-[var(--surface)] border border-[var(--border-retro)] text-[var(--foreground)]/60 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:border-[var(--foreground)]/30 transition-all duration-200"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              className="px-6 py-2 bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/40 text-[var(--neon-green)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-green)]/20 hover:border-[var(--neon-green)]/60 transition-all duration-200"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <div className="text-center py-12">
          <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] text-lg mb-2 animate-pulse">
            Importing...
          </div>
          <p className="text-[var(--foreground)]/40 text-sm">Creating sections and concepts</p>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="text-center py-12">
          <div className="text-[var(--neon-green)] font-[family-name:var(--font-share-tech-mono)] text-2xl mb-3 glow-green">
            Imported!
          </div>
          <p className="text-[var(--foreground)]/70 mb-1">
            <span className="text-[var(--foreground)]">{result.name}</span>
          </p>
          <p className="text-[var(--foreground)]/40 text-sm mb-6">
            {result.sections} sections &middot; {result.concepts} concepts
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push(`/subject/${result.slug}`)}
              className="px-6 py-2 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all duration-200"
            >
              Start Learning
            </button>
            <button
              onClick={() => {
                setStep("paste");
                setJsonText("");
                setPreview(null);
                setResult(null);
              }}
              className="px-5 py-2 bg-[var(--surface)] border border-[var(--border-retro)] text-[var(--foreground)]/60 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:border-[var(--foreground)]/30 transition-all duration-200"
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
