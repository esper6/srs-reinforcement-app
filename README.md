# SRS Reinforcement

An AI-powered spaced repetition app for STEM learning. Instead of flashcards, you learn through multi-turn Socratic interviews with Claude. The AI probes what you know, identifies gaps, and scores your understanding per-facet using a forgetting-curve decay model.

## How It Works

**Assess** - Claude asks open-ended questions about a concept, probing 3-5 key facets through Socratic dialogue. It scores each facet independently based on what you demonstrated unprompted (not what you parroted back after being told).

**Review** - When a concept's mastery decays past its threshold, it enters the review queue. Reviews are cold recall tests — no hints, no framing. Scores update per-facet, and untested facets keep their previous scores.

**Extra Credit** - After assessment, the chat stays open in a relaxed mode. Ask follow-up questions, explore topics deeper, or read the source lesson. No scores are affected.

### Mastery Model

Each concept has 3-5 sub-masteries (facets) with independent scores and decay rates. The overall mastery is the average of facet scores. Mastery decays exponentially over time (`score * e^(-decayRate * days)`), and review thresholds are relative — strong concepts (90+) trigger review at ~60%, weak ones at ~25%.

Reviews are interleaved across subjects (WaniKani-style) so you don't burn out on one topic.

### Scoring

The AI is calibrated to be strict:
- Cold recall with specific details = full credit
- Vague hand-waving ("maybe some kind of token") = 20-35%
- Buzzword dropping without explanation = 30-40%
- "I don't know" = 0-10% (honest and scored honestly)
- Parroting back corrections = no credit

## Tech Stack

- **Next.js 16** (App Router) on Vercel
- **Neon Postgres** via Prisma 7 with `@prisma/adapter-pg`
- **NextAuth v4** with Google OAuth (database sessions)
- **Claude API** (Sonnet) with streaming SSE
- **Tailwind CSS v4** with a neo-retro neon theme

## Setup

```bash
npm install
```

Create `.env.local`:
```
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3003
NEXTAUTH_SECRET=your-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ANTHROPIC_API_KEY=sk-ant-...
```

Run migrations and seed:
```bash
npx prisma migrate dev
npm run seed
```

Start the dev server:
```bash
npm run dev -- -p 3003
```

## Adding Curricula

### Quick Start

1. Add your curriculum JSON object to the array in `curricula-export.json`
2. Run `npm run seed` (upserts by slug — safe to re-run)

### JSON Schema

Each curriculum is a single object in the `curricula-export.json` array. **Keys are PascalCase.**

```json
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
          "LessonMarkdown": "### Concept Title\n\nFull markdown lesson...",
          "Order": 1,
          "Prompts": []
        }
      ]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `Slug` | Yes | URL-safe, unique across all curricula |
| `Order` | Yes | Controls display order on the dashboard |
| `Sections` | Yes | 4-6 per curriculum, ordered by progression |
| `Concepts` | Yes | 5 per section recommended |
| `LessonMarkdown` | Yes | The source of truth — Claude assesses and teaches from this |
| `Description` | Yes | Short summary for each concept |
| `Prompts` | Yes | Pass an empty array `[]` — the AI generates all questions dynamically |
| `Language`, `IconClass` | Yes | Can be empty strings |

### Lesson Markdown Requirements

The `LessonMarkdown` is the most important field. Claude uses it as the sole reference material during Socratic assessment. A poorly structured lesson produces poor assessments.

**Structure:** Each lesson should have **3-5 clearly delineated sections**, each mapping to one assessable facet (sub-mastery). Use `####` subheadings to separate facets.

**Per facet, cover four levels:**
- **What** — Definition (what is this thing?)
- **Why** — Motivation (why does it matter? what problem does it solve?)
- **How** — Mechanism (how does it actually work under the hood?)
- **When** — Judgment (when should you use it vs. alternatives? what are the trade-offs?)

These four levels give Claude room to probe at different depths. A student who knows the "what" but not the "why" scores ~25-40% on that facet.

**Length:** 800-1500 words per lesson.

**Do:**
- Use narrative that connects ideas ("This matters because...", "The trade-off is...")
- Include concrete examples and analogies
- Use contrast ("X is like Y, but differs because Z")

**Don't:**
- Write bullet-point glossaries — Claude can't have a Socratic conversation about a list of definitions
- Make facets overlap with other concepts in the same section
- Write concepts so narrow they only have 1-2 facets (merge them) or so broad they need 8+ (split them)

**The test:** Could a tutor have a meaningful 10-minute conversation assessing this concept? If yes, the lesson is scoped right.

### Seeding

```bash
# Seed local dev database
npm run seed

# Seed production database
DATABASE_URL="your-prod-connection-string" npm run seed
```

The seed script upserts curricula by slug and deletes/recreates sections and concepts on each run. Existing mastery data for a curriculum is **not** affected — students keep their scores even if the lesson content is updated.
