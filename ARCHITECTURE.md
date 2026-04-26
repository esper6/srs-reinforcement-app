# MEMORY.dump — Architecture Guide

> **Rounds Redesign: Live**
> The curriculum/Socratic side runs on a WaniKani-style **rounds model** with discrete facet levels (Novice → Apprentice → Journeyman → Expert → Mastered). Bounded 1-3 question rounds, binary advance/drop, capstone synthesis. Live at `/learn/[conceptId]` and `/subject/[slug]`. Vocab SRS is untouched.
> See **`docs/rounds-redesign.md`** for design rationale and history.
>
> The legacy assessment-mode code (`buildAssessPrompt`/etc., `parseMasteryTag`/etc., `mastery.ts`, DecayQueue/MasteryBar/SubMasteryBreakdown components, `/review` page and route, score/decayRate DB columns) was removed in Phase 6 cleanup. `ASSESS`/`LEARN`/`REVIEW` enum values still sit in the `SessionMode` Postgres type — they're inert (no code references, no rows have them) and dropping them would require recreating the enum, not worth the migration churn.

## What Is This?

An AI-powered spaced repetition app for learning. Users authenticate with Google, browse curricula, and learn through bounded **rounds** with Claude — short 1-3 question interactions on one facet at a time, ending in a binary advance/drop verdict. Mastery is tracked per facet via discrete levels (Novice → Apprentice → Journeyman → Expert) with a 3-stage Expert staircase. After all facets reach Expert/3, a synthesis round can master the concept entirely. Vocab SRS is a separate, simpler system on the same dashboard.

## Core Concepts

**Curriculum → Section → Concept → Facets** — Authored content hierarchy. Each concept has `lessonMarkdown` (the source of truth Claude reads) and `facets: string[]` (3-5 entries matching `####` subheadings in the lesson character-for-character). Curricula are imported via the `/import` page or seeded from `curricula-export.json`. The Facets contract is enforced at import time.

**ConceptMastery + SubConceptMastery** — Per-user per-concept state.
- `SubConceptMastery` (one row per facet): `level` (FacetLevel enum), `expertStage` (0 for non-Expert; 1-3 for the Expert staircase), `nextDueAt`, `lastReviewedAt`.
- `ConceptMastery`: `mastered` (true after passing synthesis), `masteredAt`, `synthesisCooldownUntil`, `reviewCount`, `lastReviewedAt`.

**Round** — One facet, 1-3 questions, binary verdict. Server picks the weakest overdue facet (lowest level, then lowest Expert stage, then earliest `nextDueAt`). Claude opens with a concrete scenario drawn from that facet's `####` subsection, takes up to 3 student responses, then emits a `<round_result name="…" outcome="advance|drop" />` tag. The route applies the level transition via `src/lib/levels.ts` and updates `nextDueAt`.

**Synthesis** — Capstone round when every facet is at Expert stage 3 and no cooldown is active. Cross-facet integration test, single round, `pass` masters the concept; `fail` sets a 1-week cooldown with no facet drops.

**Intervals** — Novice 4h · Apprentice 1d · Journeyman 4d · Expert stage 1 = 2w · stage 2 = 1mo · stage 3 = 3mo · Mastered = never. Defined in `src/lib/levels.ts`.

**Round queue** — `/subject/[slug]` renders the per-concept pip chart driven by current facet states. Each concept shows N pips per facet (filled = level rank), magenta highlight on overdue, "Start ▶" / "Synthesis ▶" / "✓" action depending on state. Driven by inline Prisma query mirroring `/api/round-queue` (which exists for client consumers).

**Extra Credit** — Open chat after a round, no scoring. Triggered by the round result screen; hits `/api/chat` (the only path that route still serves). Warm amber/brown palette to visually distinguish from the test surface.

**AI Integration** — Multi-provider LLM with streaming SSE (Claude via the relay; Anthropic/OpenAI/Google with API keys). Round/synthesis verdicts are emitted as XML-shaped tags (`<round_result>`, `<synthesis_result>`) parsed in `src/lib/claude.ts`. We use tags rather than tool use because the Claude relay wraps the CLI, not the API — see `memory/project_no_api_access.md`.

## Key Files

### Must-read to understand the system:
- `src/lib/levels.ts` — Pure level/interval/advancement logic. `advance()`, `drop()`, `getInterval()`, `nextDueAt()`, `isSynthesisReady()`. Single source of truth for the staircase.
- `src/lib/prompts.ts` — Round and synthesis prompt builders + Extra Credit prompt. Contains the `LEVEL_BARS` rubric Claude evaluates against.
- `src/lib/claude.ts` — `parseRoundResult` / `parseSynthesisResult` and their strip helpers. Strict regex on outcome union.
- `prisma/schema.prisma` — Data model. Note: `facets: String[]` on Concept; `level`/`expertStage`/`nextDueAt` on SubConceptMastery; `mastered`/`synthesisCooldownUntil` on ConceptMastery.
- `src/app/api/round/route.ts` — The meatiest backend route. Picks weakest overdue facet, builds prompt with up to 5 prior openers for variety, streams Claude, applies state transition.
- `src/app/api/synthesis/route.ts` — Capstone round; eligibility + cooldown handling.
- `src/app/learn/[conceptId]/page.tsx` — State machine over loading → lesson_gate → round → result → synthesis_gate → synthesis → mastered.

### Pages:
- `src/app/page.tsx` — Landing / sign-in
- `src/app/dashboard/page.tsx` — Subject cards grid showing "{N} / {M} mastered" per subject
- `src/app/subject/[slug]/page.tsx` — Subject detail with `RoundQueue` pip chart + concept list
- `src/app/learn/[conceptId]/page.tsx` — Per-concept entry point; orchestrates LessonGate / RoundView / RoundResultView / SynthesisView / SynthesisResultView / ChatInterface (extra credit)
- `src/app/learn/queue/[slug]/page.tsx` — Chains through unstarted concepts in a subject
- `src/app/import/page.tsx` — Paste-JSON curriculum import with validation and preview
- `src/app/drill/[slug]/page.tsx` — Vocab SRS drills (separate system, untouched by rounds redesign)

### Components:
- `src/components/RoundView.tsx` — Live round UI with Continue button when resolved
- `src/components/RoundResultView.tsx` — Post-round screen with Next Round / Extra Credit / Done
- `src/components/SynthesisView.tsx` — Capstone UI, magenta accent
- `src/components/SynthesisResultView.tsx` — Mastered celebration on pass; cooldown screen on fail
- `src/components/LessonGate.tsx` — First-encounter lesson view before round 1
- `src/components/RoundQueue.tsx` — Subject-page pip chart
- `src/components/ChatInterface.tsx` — Extra-credit-only chat surface
- `src/components/MessageBubble.tsx` — Shared chat bubble for round/synthesis/extra credit views

### Hooks:
- `src/hooks/useRound.ts` — SSE streaming for `/api/round`, exposes `roundResult` state for the Continue-button transition
- `src/hooks/useSynthesis.ts` — Same shape, `/api/synthesis`
- `src/hooks/useChat.ts` — Extra-credit transport against `/api/chat`

### API Routes:
- `POST /api/round` — Core round endpoint; auto-picks facet, streams, applies advance/drop
- `POST /api/synthesis` — Capstone; eligibility check + pass/fail handling
- `GET /api/round-queue?subject=slug` — Read feed for the round queue UI
- `GET /api/concept/[conceptId]` — Concept info + the user's mastery state
- `POST /api/chat` — Extra-credit-only chat (no scoring)
- `POST /api/import-curriculum` — Validates Facets contract; rejects malformed imports
- `GET /api/assess-queue?subject=slug` — Unstarted concepts for `/learn/queue/[slug]`

### Auth & Routing:
- `src/proxy.ts` — Route protection via session cookie check (NOT middleware.ts, which is deprecated in Next.js 16)
- `src/lib/auth.ts` — NextAuth config with Google provider + PrismaAdapter
- `src/lib/db.ts` — Prisma client with pg.Pool adapter

## Tech Stack
- Next.js 16 (App Router), self-hosted on the Azure VM at memorydump.app
- Self-hosted Postgres on the same VM via `@prisma/adapter-pg` (requires `pg.Pool` for transaction support)
- Prisma 7 with `postinstall` hook (still useful — generates the client on `npm install`)
- NextAuth v4 with Google provider + PrismaAdapter (database sessions, NOT JWT)
- Multi-provider LLM: Anthropic, OpenAI, Google, and Claude Relay (via Claude Code CLI)
- Tailwind CSS v4 with neo-retro theme (CSS vars in `globals.css`)
- Cloudflare DNS pointing at the VM
- **Azure VM** (`greg-w-vm`, East US 2, D2ps_v6 ARM64) — hosts everything: Next.js app, Postgres, Claude Relay. Funded by VS Enterprise $150/mo credits.

## Claude Relay

The relay server (`claude-relay/`) allows using an enterprise Claude license (via Claude Code CLI) instead of API keys. It runs on the Azure VM and exposes two HTTP endpoints that the Vercel app calls:

- `POST /api/stream` — Streaming chat (spawns `claude --print`, streams SSE back)
- `POST /api/single` — Single-shot responses (vocab grading, generation)

**Architecture:**
```
Vercel (Next.js) → HTTPS → Azure VM (relay) → claude --print → Claude (enterprise license)
```

**Key files:**
- `claude-relay/src/index.ts` — Express server, auth, conversation formatting, CLI spawning
- `src/lib/llm.ts` — `CLAUDE_RELAY` provider (streamRelay, singleRelay functions)

**App env vars:** `CLAUDE_RELAY_URL`, `CLAUDE_RELAY_SECRET`
**Relay env vars:** `RELAY_SECRET`, `PORT`

Users select "Claude Relay" in Settings → API Keys. No API key needed — the relay uses the CLI's OAuth auth.

## Azure VM (greg-w-vm) — Live Hosting

The Azure VM (D2ps_v6: 2 ARM64 vCPUs, 8GB RAM, Ubuntu 24.04, East US 2) is funded by VS Enterprise monthly credits ($150/mo). It hosts **everything**:

- **Next.js app** — running directly on the VM (was Vercel)
- **Postgres** — self-hosted on the VM with two databases:
  - `srsapp` — production
  - `srsapp-dev` — development
- **Claude Relay** — `claude-relay/` Express server via systemd
- **Nginx** — reverse proxy + TLS termination for all services

Environment routing is plain `DATABASE_URL` pointing at the right database — no more Neon-Vercel branch integration.

## Important Gotchas

1. **Prisma 7 + Postgres** — Uses `@prisma/adapter-pg` with `pg.Pool` for transaction support. See `src/lib/db.ts`.
2. **Prisma client generation** — `postinstall` runs `prisma generate`. Always annotate Prisma callback params explicitly to avoid implicit-any TypeScript errors during build.
3. **Auth uses proxy, not middleware** — `src/proxy.ts` checks session cookies. `middleware.ts` is deprecated in Next.js 16. `getToken()` won't work (database sessions, not JWT).
4. **The bar criteria are in prompts** — `LEVEL_BARS` in `src/lib/prompts.ts` describes what each level transition requires. Tuning Claude's verdicts means editing that, not code.
5. **The `[START ROUND]` / `[START SYNTHESIS]` triggers** — First message in each session is automated, not from the student. Prompts and message-counting logic account for this.
6. **Facet contract** — `Concept.facets[]` must match the `####` subheadings in `lessonMarkdown` character-for-character, in order. Enforced by `/api/import-curriculum`. The round prompt anchors scenarios to the facet's `####` subsection.
7. **Round-result tag stripping** — Output text is shown to the user with `<round_result>` and `<synthesis_result>` tags stripped via regex. The full text (including tags) is what we parse server-side.
8. **No tool use available** — The Claude relay wraps the CLI, not the API, so structured outputs come from regex over XML-shaped tags. See `memory/project_no_api_access.md`.
9. **Import refuses to overwrite progress** — Returns 409 if slug exists with mastery data.
10. **JSON schema is PascalCase** — Seed and import expect `Name`, `Slug`, `LessonMarkdown`, `Facets`, etc.

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
