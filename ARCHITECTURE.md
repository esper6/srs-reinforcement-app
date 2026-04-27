# MEMORY.dump — Architecture Guide

> **Rounds Redesign: Live**
> The curriculum/Socratic side runs on a WaniKani-style **rounds model** with discrete facet levels (Novice → Apprentice → Journeyman → Expert → Mastered). Bounded 1-3 question rounds, binary advance/drop, capstone synthesis. Live at `/learn/[conceptId]`, `/subject/[slug]`, and `/burn/[slug]` (cross-concept burn pile).
> See **`docs/rounds-redesign.md`** for design rationale and history.
>
> Vocab SRS is a separate engine that shares the stage vocabulary (Novice → Apprentice → Journeyman → Expert → Burned) for UI consistency. The math underneath is still SM-2 ease-factor; the alignment is purely cosmetic — see `src/lib/vocab-srs.ts`.
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

**Round queue** — `/subject/[slug]` renders the per-concept pip chart driven by current facet states. Each concept shows N pips per facet (filled = level rank), magenta highlight on overdue, "Start ▶" / "Synthesis ▶" / "Not started" action depending on state. Driven by inline Prisma query mirroring `/api/round-queue` (which exists for the burn page). The header shows total burnable rounds due (only counts started concepts — lesson-gate concepts have epoch `nextDueAt`s that read as "due" but aren't drillable until the user has read the lesson and done their first round). When > 0, a "Burn through ▶" link surfaces.

**Burn pile** — `/burn/[slug]` chains rounds across concepts in a single session, like WaniKani's review pile. Reuses `RoundView` and `/api/round`; client-side scheduler picks the weakest-overdue facet across eligible concepts (started, not mastered, not synthesis-ready, no cooldown), then re-fetches and re-picks after each result. Lesson-gate concepts and synthesis-ready concepts are excluded — those flows want explicit entry via `/learn/[id]`.

**BurnedShelf** — Trophy view on the subject page below the round queue. Lists concepts that cleared synthesis, sorted most-recent-first with relative timestamps. Click-through goes to `/learn/[id]` which renders the MASTERED terminal screen.

**Per-user archive** — Any approved user can hide a curriculum from their own dashboard via the "Archive" button on the subject page. State lives on `UserCurriculumPref(userId, curriculumId, archivedAt?)` — never mutates the shared Curriculum row, so one user archiving doesn't affect anyone else. Dashboard hides archived by default with an "Archived (N)" toggle to flip into the archived-only view.

**Subject deletion (admin)** — Destructive operation that cascades through every related table (sections, concepts, mastery, sessions, vocab progress). Admin-only because curricula are shared across users; one user shouldn't be able to wipe everyone's progress on a curriculum. Confirmation modal lists what will be deleted before the click.

**Round history** — Per-concept "Recent Rounds" section on `/learn/[id]`, visible in non-active states (mastered, no_rounds_due, synthesis_gate, synthesis_cooldown). Pulls finished `ChatSession` rows and parses outcome + facet name from the result tag in the last assistant message. Click a row to expand the full transcript inline.

**Skip / re-pick facet** — On the round screen header, before the user has sent any response, a "Switch facet ▼" affordance lets them pick a different due facet on the same concept. Once they engage, the button hides — switching mid-round would discard real work. The original `ChatSession` is left orphaned (auto-filtered from openings via the `finishedAt: { not: null }` query).

**Extra Credit** — Open chat after a round, no scoring. Triggered by the round result screen; hits `/api/chat` (the only path that route still serves). Warm amber/brown palette to visually distinguish from the test surface.

**AI Integration** — Multi-provider LLM with streaming SSE (Claude via the relay; Anthropic/OpenAI/Google with API keys). Round/synthesis verdicts are emitted as XML-shaped tags (`<round_result>`, `<synthesis_result>`) parsed in `src/lib/claude.ts`. We use tags rather than tool use because the Claude relay wraps the CLI, not the API — see `memory/project_no_api_access.md`.

## Key Files

### Must-read to understand the system:
- `src/lib/levels.ts` — Pure level/interval/advancement logic. `advance()`, `drop()`, `getInterval()`, `nextDueAt()`, `isSynthesisReady()`. Single source of truth for the staircase.
- `src/lib/prompts.ts` — Round and synthesis prompt builders + Extra Credit prompt. Contains the `LEVEL_BARS` rubric Claude evaluates against.
- `src/lib/claude.ts` — `parseRoundResult` / `parseSynthesisResult` and their strip helpers. Strict regex on outcome union.
- `prisma/schema.prisma` — Data model. Note: `facets: String[]` on Concept; `level`/`expertStage`/`nextDueAt` on SubConceptMastery; `mastered`/`synthesisCooldownUntil` on ConceptMastery; `UserCurriculumPref(userId, curriculumId, archivedAt?)` is the per-user archive flag.
- `src/app/api/round/route.ts` — The meatiest backend route. Picks weakest overdue facet, builds prompt with up to 5 prior openers for variety, streams Claude, applies state transition.
- `src/app/api/synthesis/route.ts` — Capstone round; eligibility + cooldown handling.
- `src/app/learn/[conceptId]/page.tsx` — State machine over loading → lesson_gate → round → result → synthesis_gate → synthesis → mastered.

### Pages:
- `src/app/page.tsx` — Landing / sign-in
- `src/app/dashboard/page.tsx` — Subject cards grid; per-user archive filter with `?archived=1` toggle
- `src/app/subject/[slug]/page.tsx` — Subject detail with `RoundQueue` (active concepts + Burn link) and `BurnedShelf` (mastered concepts). Admin sees Archive + Delete affordances; non-admin sees Archive only.
- `src/app/learn/[conceptId]/page.tsx` — Per-concept entry point; orchestrates LessonGate / RoundView / RoundResultView / SynthesisView / SynthesisResultView / ChatInterface (extra credit) / RoundHistoryViewer
- `src/app/burn/[slug]/page.tsx` — Cross-concept burn pile; chains rounds across eligible concepts in one session
- `src/app/import/page.tsx` — Paste-JSON curriculum import with validation and preview
- `src/app/drill/[slug]/page.tsx` — Vocab SRS drills (separate system, stages renamed to align with rounds)

### Components:
- `src/components/RoundView.tsx` — Live round UI with Continue button when resolved. Hosts the "Switch facet ▼" affordance (visible pre-engagement only).
- `src/components/RoundResultView.tsx` — Post-round screen with Next Round / Extra Credit / Done. `showExtraCredit` prop hides EC in burn mode.
- `src/components/SynthesisView.tsx` — Capstone UI, magenta accent
- `src/components/SynthesisResultView.tsx` — Mastered celebration on pass; cooldown screen on fail
- `src/components/LessonGate.tsx` — First-encounter lesson view before round 1
- `src/components/RoundQueue.tsx` — Subject-page pip chart with "Burn through ▶" link in the header. Filters out mastered concepts (those live in BurnedShelf).
- `src/components/BurnedShelf.tsx` — Trophy view of mastered concepts on the subject page
- `src/components/ArchiveSubjectButton.tsx` — Per-user archive toggle on the subject page header
- `src/components/DeleteSubjectButton.tsx` — Admin-only destructive delete with confirmation modal
- `src/components/RoundHistoryViewer.tsx` — "Recent Rounds" panel on `/learn/[id]` non-active states; expandable transcripts
- `src/components/ChatInterface.tsx` — Extra-credit-only chat surface
- `src/components/MessageBubble.tsx` — Shared chat bubble for round/synthesis/extra credit views

### Hooks:
- `src/hooks/useRound.ts` — SSE streaming for `/api/round`, exposes `roundResult` state for the Continue-button transition
- `src/hooks/useSynthesis.ts` — Same shape, `/api/synthesis`
- `src/hooks/useChat.ts` — Extra-credit transport against `/api/chat`

### API Routes:
- `POST /api/round` — Core round endpoint. Auto-picks weakest overdue facet, or honors a client-provided `facetName` (validated as in-concept and currently due) for the skip/re-pick affordance. Streams Claude, applies advance/drop.
- `POST /api/synthesis` — Capstone; eligibility check + pass/fail handling
- `GET /api/round-queue?subject=slug` — Read feed driving the burn page. Returns per-concept `started` flag (≥1 SubConceptMastery row) and `totalRoundsDue` already filtered to started concepts.
- `GET /api/concept/[conceptId]` — Concept info + the user's mastery state
- `GET /api/concept/[conceptId]/history` — Up to 10 most-recent finished round/synthesis sessions with parsed outcomes and full transcripts
- `DELETE /api/curriculum/[slug]` — Admin-only destructive delete (cascades through schema)
- `PATCH /api/curriculum/[slug]` — Per-user archive/unarchive (any approved user). Body: `{ archived: boolean }`. Upserts a `UserCurriculumPref` row.
- `POST /api/chat` — Extra-credit-only chat (no scoring)
- `POST /api/import-curriculum` — Validates Facets contract; rejects malformed imports
- `GET /api/health` — Unauthenticated liveness + DB ping. Used by deploy script's healthcheck loop.

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
Next.js (on the same VM, port 3000/3001) → HTTP loopback → Claude Relay (port 8787) → claude --print → Claude (enterprise license)
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
9. **Import refuses to overwrite progress** — Returns 409 if slug exists with mastery data. Re-importing a curriculum with progress requires `Delete subject` first (admin-only), which wipes everything.
10. **JSON schema is PascalCase** — Seed and import expect `Name`, `Slug`, `LessonMarkdown`, `Facets`, etc.
11. **Hardened deploy script** — `deploy/deploy-{dev,prod}.sh` builds *before* migrating (so a build failure doesn't leave the service running stale code on a new schema), then polls `/api/health` post-restart with a 60s timeout. The GH action's exit code reflects whether the new process is actually serving requests, not just whether `systemctl restart` was requested. Note: changes to the deploy script itself take effect on the deploy *after* they're merged, since bash already loaded the previous version into memory at script start.
12. **Round count vs burn pile** — `totalRoundsDue` shown on the subject page only counts `started` concepts (those with ≥1 `SubConceptMastery` row). Lesson-gate concepts have epoch `nextDueAt`s that read as "due" but aren't burnable; counting them inflates the header and creates a "100 rounds due → queue clear" disconnect.

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
