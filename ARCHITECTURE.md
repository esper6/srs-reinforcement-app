# MEMORY.dump — Architecture Guide

## What Is This?

An AI-powered spaced repetition app for STEM learning. Users authenticate with Google, browse curricula, and learn through multi-turn Socratic interviews with Claude. Mastery is tracked per concept using a forgetting-curve decay model. Reviews are interleaved across subjects (WaniKani-style).

## Core Concepts

**Curriculum → Section → Concept** — Authored content hierarchy. Each concept has `lessonMarkdown` which is the source of truth the AI uses to generate questions. Curricula are imported from `curricula-export.json` via the seed script.

**ConceptMastery** — Per-user per-concept. Tracks `score` (0-100), `decayRate` (float), `lastReviewedAt`. Mastery is never stored as a decayed value — it's always computed on read via `score × e^(-decayRate × daysSince)`.

**Relative Review Threshold** — NOT a flat threshold. Strong concepts (90+) trigger review at ~60%, moderate at ~40%, weak at ~25%. See `src/lib/mastery.ts:getReviewThreshold()`.

**ChatSession / ChatMessage** — Full conversation transcripts stored per interaction. Each session has a mode: ASSESS, LEARN, or REVIEW.

**AI Integration** — Claude API (Sonnet) with streaming. The AI generates all questions dynamically from lesson markdown. System prompts enforce Socratic questioning — the AI probes rather than lectures. Mastery scores are embedded in responses as `<mastery score="X" decay_rate="Y" />` tags, parsed server-side and stripped from display.

## Key Files

### Must-read to understand the system:
- `src/lib/mastery.ts` — Decay formula, relative threshold calculation
- `src/lib/prompts.ts` — All AI system prompts (assess, learn, review). These define the pedagogical behavior.
- `src/lib/claude.ts` — Claude API client, streaming, mastery tag parsing
- `prisma/schema.prisma` — Complete data model
- `src/app/api/chat/route.ts` — Core API: builds conversation, streams Claude response, saves messages, updates mastery

### Pages:
- `src/app/page.tsx` — Landing / sign-in
- `src/app/dashboard/page.tsx` — Subject cards + review banner (server component)
- `src/app/subject/[slug]/page.tsx` — Subject detail: Lessons/Reviews buttons, decay queue, concept list (server component)
- `src/app/learn/[conceptId]/page.tsx` — Single concept assessment with mastery graph
- `src/app/learn/queue/[slug]/page.tsx` — Chains through unstarted concepts in a subject
- `src/app/review/page.tsx` — Interleaved review queue, supports `?subject=slug` filter

### Components:
- `src/components/ChatInterface.tsx` — Multi-turn streaming chat UI, shared by learn + review
- `src/components/DecayQueue.tsx` — Shows assessed concepts with countdown timers to next review
- `src/components/MasteryGraph.tsx` — Animated bar graph of subject mastery, shown after assessment

### API Routes:
- `POST /api/chat` — Core endpoint. Takes `conceptId`, `mode`, `sessionId`, `userMessage`. Streams SSE.
- `GET /api/review?subject=slug` — Review queue (optional subject filter)
- `GET /api/assess-queue?subject=slug` — Unstarted concepts for a subject
- `GET /api/subject-masteries?subject=slug` — All mastery scores for a subject
- `GET /api/concept/[conceptId]` — Concept info with section/curriculum

## Tech Stack
- Next.js 16 (App Router) on Vercel
- Neon Postgres via `@prisma/adapter-pg` (requires `pg.Pool` for transaction support)
- Prisma 7 with `prisma-client-js` generator
- NextAuth v4 with Google provider + PrismaAdapter (database sessions, NOT JWT)
- Claude API via `@anthropic-ai/sdk` (streaming)
- Tailwind CSS v4 with neo-retro theme (CSS vars in `globals.css`)

## Important Gotchas

1. **Prisma 7 + Neon** — Must use `@prisma/adapter-pg` with `pg.Pool`, NOT `PrismaNeonHttp` (doesn't support transactions). See `src/lib/db.ts`.
2. **NextAuth uses database sessions** — The middleware checks cookies (`next-auth.session-token`), NOT JWT tokens. `getToken()` won't work.
3. **AI mastery scoring** — Cold recall gets full credit, Socratic-prompted answers get ~60%, told answers get ~20%. This is enforced in the system prompts, not code.
4. **The `[START ASSESSMENT]` trigger** — First message in each chat is an automated trigger, not from the student. The system prompts account for this.
5. **Decay is computed, never stored** — `calculateCurrentMastery()` always computes from raw score + decayRate + timestamp. Never persist the decayed value.

## Dev Setup
```
npm install
# Set DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY in .env.local
npx prisma migrate dev
npm run seed
npm run dev -- -p 3003
```

## Adding Curricula
Add to `curricula-export.json` (or a new JSON) and re-run `npm run seed`. The seed script upserts by slug so it's safe to re-run. Each concept needs: Title, Description, LessonMarkdown, Order. The AI generates all questions from the lesson markdown — no need to author prompts.
