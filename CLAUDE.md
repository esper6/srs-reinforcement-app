@AGENTS.md

# MEMORY.dump

> **Rounds Redesign: Live**
> Curriculum/Socratic side runs on a WaniKani-style **rounds model** — discrete facet levels (Novice → Apprentice → Journeyman → Expert → Mastered), bounded 1-3 question rounds, binary advance/drop, capstone synthesis. Vocab SRS is a separate untouched system.
> Spec: **`docs/rounds-redesign.md`**. Read before editing AI behavior (`src/lib/prompts.ts`, `src/lib/levels.ts`), the round routes (`/api/round`, `/api/synthesis`, `/api/round-queue`, `/api/chat` extra-credit), or the round UI components.

Read `ARCHITECTURE.md` first — it has key files, gotchas, and how things connect.

## Quick Orientation
- AI-powered SRS app. The curriculum side runs on rounds; the vocab side runs on a classic flashcard SRS.
- All AI behavior is driven by system prompts in `src/lib/prompts.ts`. The lesson markdown is the source of truth.
- Round flow: `src/app/api/round/route.ts` picks weakest overdue facet → builds prompt → streams Claude → parses `<round_result>` → applies advance/drop via `src/lib/levels.ts`.
- Database sessions (not JWT). Prisma 7 + pg.Pool adapter. See `src/lib/db.ts`.

## Commands
```
npm run dev -- -p 3003     # Dev server (3000-3002 may be taken)
npm run seed               # Seed curricula from JSON
npx prisma migrate dev     # Run migrations
npx prisma studio          # DB browser
npm run build              # Production build (always test before push)
```

## Deployment
- **Self-hosted on Azure VM** `greg-w-vm` at `20.242.97.67` (East US 2, D2ps_v6 ARM64, Ubuntu 24.04). Domain memorydump.app via Cloudflare DNS pointing at the VM. Funded by VS Enterprise $150/mo credits.
- **Everything lives on the VM**: Next.js app, Postgres, Claude Relay, Nginx (reverse proxy + TLS).
- **Two databases on the VM Postgres**: `srsapp` (production), `srsapp-dev` (development). Routing is plain `DATABASE_URL` per environment — no Neon branches anymore.
- **Git workflow**: code on `develop` → deploy to dev → merge to `master` for production.
- **Prisma client generation**: `postinstall` hook runs `prisma generate`. Always annotate Prisma callback params explicitly (use local type aliases like `type Section = (typeof result.sections)[number]`) to avoid implicit-any errors at build time.
- **SSH**: `ssh -i ~/.ssh/greg-w-vm_key.pem azureuser@20.242.97.67`

### Claude Relay
- **Purpose**: Runs Claude Code CLI relay so the app can use enterprise Claude license instead of API keys.
- **Relay server**: `claude-relay/` directory — Express app, deployed via systemd on the VM.
- **App env vars**: `CLAUDE_RELAY_URL`, `CLAUDE_RELAY_SECRET` (the app calls localhost-or-internal-URL to reach the relay since they share the VM).
- **Why regex tags, not tool use**: relay wraps the CLI which doesn't expose tool definitions to callers. See `memory/project_no_api_access.md`.

## Architecture Patterns

### Facets and the round engine
Every concept has 3-5 **facets** declared in `Concept.facets: string[]` and matching `####` subheadings in the lesson markdown character-for-character. Each user/concept gets one `SubConceptMastery` row per facet, tracking `level` (FacetLevel enum) + `expertStage` (0 for non-Expert; 1-3 for the staircase) + `nextDueAt`.

The round engine:
1. `/api/round` picks the weakest overdue facet for a concept (`pickWeakestOverdue` — sort by level rank, then Expert stage, then nextDueAt).
2. `buildRoundPrompt` anchors the opening scenario to the `#### {facetName}` subsection of the lesson, includes up to 5 prior round openers to push for variety, and instructs Claude to commit within 3 questions.
3. Claude emits `<round_result name="..." outcome="advance|drop" />` at the end of its final message.
4. `parseRoundResult` extracts the verdict; `advance()` or `drop()` from `levels.ts` computes the new state; `nextDueAt` set from `getInterval()`.
5. Synthesis (`/api/synthesis`) is the capstone: all facets at Expert/3, no cooldown → one cross-facet integration round → pass masters the concept, fail sets a 1-week cooldown without dropping facets.

### Round UI flow (`/learn/[conceptId]`)
State machine: loading → (needs_reimport | mastered | synthesis_cooldown | synthesis_gate | lesson_gate | round | result | extra_credit). The page fetches `/api/concept/[conceptId]` once on mount + after each round, picks the right state from the response.

- `LessonGate` — first encounter; user reads then clicks "Start First Round"
- `RoundView` — live round; swaps input form for "Continue ▶" button when `<round_result>` arrives so user can read the verdict before transitioning
- `RoundResultView` — post-round screen with three actions
- `SynthesisView` / `SynthesisResultView` — capstone equivalents
- `ChatInterface` — Extra Credit only (no scoring; serves `/api/chat`)

### Lesson visibility (locked design)
Strict separation between study (lesson visible) and test (lesson hidden):
- During a round or synthesis: lesson is NEVER shown (cold recall is the point)
- First encounter: lesson shown via `LessonGate` before round 1 starts
- Extra Credit: lesson available via expandable toggle
- Standalone: a "Read" button on the concept page (not yet built; explicit only)

### Import flow
Non-technical users create curricula via the prompt at `docs/curriculum-generator-prompt.md`:
1. Paste prompt into any LLM (Claude Code recommended for curricula >1-2 concepts; the prompt has chunked-workflow instructions for agentic LLMs)
2. Output JSON has `Facets` arrays matching `####` subheadings
3. Paste into `/import` → preview → import
4. `/api/import-curriculum` validates the Facets contract (3-5 entries, no HTML, character-for-character match with `####` headings) and stores
- Refuses to overwrite a curriculum that has user progress (409)
- JSON schema is PascalCase

## Style
- Neo-retro theme: neon cyan/magenta/green/purple on dark backgrounds. CSS vars in `src/app/globals.css`.
- Extra Credit uses a warm amber/brown palette (`--extra-credit-*` CSS vars).
- Round view: cyan accent. Synthesis view: magenta accent. Mastered: green glow.
- Font: Share Tech Mono for headings/UI, Geist for body.
- Lesson markdown styling: hand-rolled `.lesson-markdown` class in globals.css (Tailwind Typography is not installed).
- Mobile-first responsive design.

## Key Design Decisions
- **The lesson markdown is everything.** Claude has no other reference material. Lessons must be 800-1500 words with 3-5 `####` facet sections matching the `Facets` array. See `docs/curriculum-generator-prompt.md`.
- **Prompts are the tuning knob.** Verdict bars (`LEVEL_BARS`), pacing nudges, anti-coaching guards — all in `src/lib/prompts.ts`. Code just routes and parses.
- **Bounded rounds, binary verdicts.** No middle ground; Claude is forced to commit within 3 questions per round. The hard pacing nudge fires at `exchangeCount >= 3`.
- **History-aware openers.** The round prompt receives up to 5 prior openers to push Claude toward fresh scenarios across facets/sessions.
- **Synthesis fails don't drop facets.** Per design — punishing a near-miss synthesis would erase real progress and discourage retry. Cooldown alone is the consequence.

## Common Enhancement Patterns

### Adding a new page
1. Create `src/app/your-page/page.tsx`
2. Add to protected paths in `src/proxy.ts` (both `protectedPaths` array and `matcher`)
3. Add nav link in `src/components/Nav.tsx` if needed

### Adding a new API route
1. Create `src/app/api/your-route/route.ts`
2. Check auth: `const session = await getServerSession(authOptions); if (!session?.user) return 401`
3. Get user ID: `const userId = session.user.id` (NextAuth augmentation handles the type)
4. Use `prisma` from `@/lib/db` for DB queries
5. **Annotate all Prisma callback params explicitly** to avoid implicit-any errors at build time

### Modifying the round engine
- Levels, intervals, advancement: `src/lib/levels.ts` (pure functions)
- The bar criteria Claude tests against: `LEVEL_BARS` in `src/lib/prompts.ts`
- Pacing nudges: `buildRoundPrompt` / `buildSynthesisPrompt` exchange-count branches
- Round result tag format: `parseRoundResult` regex in `src/lib/claude.ts` + the format example in `buildRoundPrompt`
- Picking the weakest facet: `pickWeakestOverdue` in `/api/round/route.ts`

### Adding to the schema
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-change` (locally, against srsapp_dev or via tunnel)
3. `prisma generate` runs automatically via `postinstall`
4. On push to `develop`, the GH action runs `prisma migrate deploy` against srsapp_dev on the VM
