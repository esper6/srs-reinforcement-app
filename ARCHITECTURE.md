# MEMORY.dump — Architecture Guide

## What Is This?

An AI-powered spaced repetition app for learning. Users authenticate with Google, browse curricula, and learn through multi-turn Socratic interviews with Claude. Mastery is tracked per concept with 3-5 independent sub-masteries (facets) using a forgetting-curve decay model. Reviews are scoped per subject and triggered when any sub-mastery decays past its threshold.

## Core Concepts

**Curriculum → Section → Concept** — Authored content hierarchy. Each concept has `lessonMarkdown` which is the source of truth the AI uses to generate questions. Curricula are imported via the `/import` page or seeded from `curricula-export.json`.

**ConceptMastery + SubConceptMastery** — Per-user per-concept. ConceptMastery tracks overall `score` (0-100), `decayRate` (float), `lastReviewedAt`. SubConceptMastery tracks the same per facet (3-5 per concept). Mastery is never stored as a decayed value — it's always computed on read via `score × e^(-decayRate × daysSince)`.

**Relative Review Threshold** — NOT a flat threshold. Strong facets (90+) trigger at ~60%, moderate (60-89) at ~55%, weak (30-59) at ~75%, very weak (<30) at ~85%. Weak knowledge comes up for review within hours. See `src/lib/mastery.ts:getReviewThreshold()`.

**Review Triggering** — A concept is due if ANY sub-mastery is past its threshold, not just the overall score. This check exists in three places that must stay in sync: `src/app/api/review/route.ts`, subject page reviewCount in `src/app/subject/[slug]/page.tsx`, and `src/components/DecayQueue.tsx`.

**ChatSession / ChatMessage** — Full conversation transcripts stored per interaction. Each session has a mode: ASSESS, LEARN, or REVIEW. After assessment, the session continues in Extra Credit mode (no scoring).

**Extra Credit Mode** — After mastery tags are detected, the chat enters a warm-palette open conversation mode. The prompt switches to `buildExtraCreditPrompt()`, the backend skips mastery saves, and the UI shifts to amber/brown tones. Suggested prompts for weak facets appear as clickable chips.

**AI Integration** — Claude API with streaming SSE. The AI generates all questions dynamically from lesson markdown. Mastery scores are embedded in responses as `<mastery>` and `<sub_mastery>` tags, parsed both client-side (for UI) and server-side (for DB persistence), then stripped from display.

## Key Files

### Must-read to understand the system:
- `src/lib/mastery.ts` — Decay formula, relative threshold calculation
- `src/lib/prompts.ts` — All AI system prompts (assess, learn, review, extra credit). Scoring rules, facet rotation pacing, wrap-up instructions.
- `src/lib/claude.ts` — Claude API client, streaming, mastery/sub-mastery tag parsing
- `prisma/schema.prisma` — Complete data model including SubConceptMastery
- `src/app/api/chat/route.ts` — Core API: conversation → Claude → mastery persistence

### Pages:
- `src/app/page.tsx` — Landing / sign-in
- `src/app/dashboard/page.tsx` — Subject cards grid (server component)
- `src/app/subject/[slug]/page.tsx` — Subject detail: Lessons/Reviews buttons, sub-mastery-aware decay queue, concept list (server component)
- `src/app/learn/[conceptId]/page.tsx` — Assessment chat with inline mastery graph + extra credit mode
- `src/app/learn/queue/[slug]/page.tsx` — Chains through unstarted concepts in a subject
- `src/app/review/page.tsx` — Interleaved review queue, `?subject=slug` filter
- `src/app/import/page.tsx` — Paste-JSON curriculum import with validation and preview

### Components:
- `src/components/ChatInterface.tsx` — Multi-turn streaming chat UI with extra credit mode, inline mastery graph, suggested prompts, show-lesson expandable
- `src/components/DecayQueue.tsx` — Assessed concepts with countdown timers, sub-mastery-aware due status
- `src/components/SubMasteryBreakdown.tsx` — Per-facet bar chart after assessment
- `src/components/MasteryGraph.tsx` — Animated bar graph of subject mastery
- `src/hooks/useChat.ts` — Chat state, SSE streaming, real-time mastery tag parsing, extra credit detection

### API Routes:
- `POST /api/chat` — Core. Takes `conceptId`, `mode`, `sessionId`, `userMessage`, `extraCredit`. Streams SSE.
- `GET /api/review?subject=slug` — Review queue with sub-mastery-aware triggering
- `GET /api/assess-queue?subject=slug` — Unstarted concepts for a subject
- `GET /api/subject-masteries?subject=slug` — All mastery + sub-mastery scores
- `GET /api/concept/[conceptId]` — Concept info with section/curriculum
- `POST /api/import-curriculum` — Validates and imports curriculum JSON (rejects if slug has existing progress)

### Auth & Routing:
- `src/proxy.ts` — Route protection via session cookie check (NOT middleware.ts, which is deprecated in Next.js 16)
- `src/lib/auth.ts` — NextAuth config with Google provider + PrismaAdapter
- `src/lib/db.ts` — Prisma client with pg.Pool adapter

## Tech Stack
- Next.js 16 (App Router) on Vercel at memorydump.app
- Neon Postgres via `@prisma/adapter-pg` (requires `pg.Pool` for transaction support)
- Prisma 7 with `postinstall` hook for Vercel builds
- NextAuth v4 with Google provider + PrismaAdapter (database sessions, NOT JWT)
- Claude API via `@anthropic-ai/sdk` (streaming)
- Tailwind CSS v4 with neo-retro theme (CSS vars in `globals.css`)
- Cloudflare DNS, Neon-Vercel integration for per-environment DB branches

## Important Gotchas

1. **Prisma 7 + Neon** — Must use `@prisma/adapter-pg` with `pg.Pool`, NOT `PrismaNeonHttp`. See `src/lib/db.ts`.
2. **Prisma on Vercel** — `postinstall` runs `prisma generate`. Even so, always annotate Prisma callback params explicitly — Vercel's TS compiler may not infer them.
3. **Auth uses proxy, not middleware** — `src/proxy.ts` checks session cookies. `middleware.ts` is deprecated in Next.js 16. `getToken()` won't work (database sessions, not JWT).
4. **Scoring strictness is in prompts** — Vague answers score 20-35%, "I don't know" scores 0-10%, parroting corrections gets 0. See `SCORING_RULES` in `src/lib/prompts.ts`.
5. **The `[START ASSESSMENT]` trigger** — First message is automated, not from the student. Prompts account for this.
6. **Decay is computed, never stored** — `calculateCurrentMastery()` always computes from raw score + decayRate + timestamp.
7. **Sub-mastery review check in 3 places** — Review API, subject page, DecayQueue. Must stay in sync.
8. **Import refuses to overwrite progress** — Returns 409 if slug exists with mastery data.
9. **JSON schema is PascalCase** — Seed and import expect `Name`, `Slug`, `LessonMarkdown`, etc.

## Dev Setup
```
npm install
# Set DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY in .env.local
npx prisma migrate dev
npm run seed
npm run dev -- -p 3003
```

## Adding Curricula
Two methods:
- **Import page** (`/import`): Paste curriculum JSON, preview, import. For anyone.
- **Seed script**: Add to `curricula-export.json`, run `npm run seed`. For developers.
- **Generator prompt**: `docs/curriculum-generator-prompt.md` — a self-contained prompt users paste into any LLM to produce curriculum JSON.
