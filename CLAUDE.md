@AGENTS.md

# MEMORY.dump

Read `ARCHITECTURE.md` first — it has everything you need to understand the system, key files, gotchas, and how things connect.

## Quick Orientation
- This is an AI-powered SRS app. Users learn concepts through Socratic interviews with Claude.
- Mastery uses a forgetting-curve decay model with relative thresholds (not flat). See `src/lib/mastery.ts`.
- All AI behavior is driven by system prompts in `src/lib/prompts.ts`. The lesson markdown is the source of truth.
- The core flow: `src/app/api/chat/route.ts` builds conversation → streams Claude → parses mastery tags → updates DB.
- Database sessions (not JWT). Prisma 7 + pg.Pool adapter (not Neon HTTP). See `src/lib/db.ts`.

## Commands
```
npm run dev -- -p 3003     # Dev server (3000-3002 may be taken)
npm run seed               # Seed curricula from JSON
npx prisma migrate dev     # Run migrations
npx prisma studio          # DB browser
npm run build              # Production build (always test before push)
```

## Deployment
- **Hosted on Vercel** at memorydump.app (custom domain via Cloudflare DNS)
- **Git workflow**: code on `develop` → push for Vercel preview → merge to `master` for production
- **Neon integration**: Production deploys use `production` DB branch, preview deploys use `development` branch
- **Prisma on Vercel**: `postinstall` hook runs `prisma generate` — without this, the build fails because TypeScript can't find the generated client types
- **Vercel type strictness**: Even if `tsc` passes locally, `next build` on Vercel may fail on implicit `any` in Prisma query callbacks. Always annotate callback params on Prisma results (use local type aliases like `type Section = (typeof result.sections)[number]`)

## Architecture Patterns

### Sub-masteries
Every concept has 3-5 **facets** (sub-masteries) scored independently. This is the core differentiator of the mastery model.
- Claude outputs `<sub_mastery name="..." score="..." decay_rate="..." />` tags at the end of each assessment
- Parsed in `src/lib/claude.ts:parseSubMasteryTags()`
- Stored in `SubConceptMastery` table (linked to `ConceptMastery`)
- **Review triggering**: A concept is due for review if ANY sub-mastery is past its threshold, not just the overall score. This logic must be consistent across: `src/app/api/review/route.ts`, `src/app/subject/[slug]/page.tsx` (reviewCount), and `src/components/DecayQueue.tsx`
- Weak sub-masteries (< 30%) have aggressive thresholds (85% of score) — they come up for review within hours, not days

### Chat flow lifecycle
1. User enters a concept → `ChatInterface` sends `[START ASSESSMENT]` trigger
2. `useChat.ts` POSTs to `/api/chat` with `conceptId`, `mode`, `userMessage`
3. Route creates/loads a `ChatSession`, builds conversation history from DB
4. Claude streams response via SSE
5. Client-side: `useChat.ts` parses mastery/sub-mastery tags from the stream in real-time
6. Server-side: `collectAndSave()` runs after stream completes — saves the full message and upserts mastery scores
7. After mastery scores arrive, client shows "Masteries Updated!" button → user clicks → graph appears
8. Chat enters **Extra Credit mode**: warm color palette, no scoring, open conversation

### Extra Credit mode
After assessment completes, the chat stays open in a relaxed mode:
- Triggered when mastery tags are detected in the stream (`useChat.ts`)
- Backend: `extraCredit: true` flag sent in POST body, prompt switches to `buildExtraCreditPrompt()`
- UI: warm color palette (amber/brown tones), "Extra Credit mode engaged!" label, different placeholder text
- Suggested prompts appear based on weak facets — clickable to auto-fill the chat input
- **No mastery scores are affected** in this mode — the backend skips `collectAndSave` mastery logic

### Import flow
Non-technical users can create curricula using a one-shot LLM prompt (`docs/curriculum-generator-prompt.md`):
1. User pastes prompt + topic into any LLM (Claude.ai, ChatGPT)
2. Gets back curriculum JSON
3. Pastes into `/import` page → preview → import
4. API route (`/api/import-curriculum`) validates schema, checks for slug conflicts with existing progress, upserts
- **Safety**: Won't overwrite a curriculum that has student mastery data. Returns 409 with clear error.
- **JSON schema uses PascalCase keys** (Name, Slug, Sections, Concepts, LessonMarkdown, etc.)

## Style
- Neo-retro theme: neon cyan/magenta/green/purple on dark backgrounds. CSS vars in `src/app/globals.css`.
- Extra Credit mode uses warm amber/brown palette (separate CSS vars prefixed `--extra-credit-*`)
- Font: Share Tech Mono for headings/UI, Geist for body.
- Mobile-first responsive design.
- Animations: use dramatic cubic-bezier curves for kinetic feel (slow start, fast finish)

## Key Design Decisions
- **Reviews are scoped per subject**, not global. No global review banner — users access reviews from within each subject page via `SubjectQueueButtons`.
- **The lesson markdown is everything**. Claude has no other reference material. Lessons must be 800-1500 words with 3-5 clearly delineated facet sections, each covering what/why/how/when. See `docs/curriculum-generator-prompt.md` for the full spec.
- **Prompt engineering is the tuning knob**. To change AI behavior (scoring strictness, conversation pacing, wrap-up verbosity), edit `src/lib/prompts.ts`. The code just routes and parses — the prompts define the pedagogy.
- **Facet rotation pacing**: Claude is instructed to spend max 2-3 exchanges per facet, prioritize weak/untested facets, and wrap up after probing all facets (typically 4-8 total exchanges). A pace check is injected when exchange count exceeds 6.
- **Strict scoring**: Vague answers ("maybe some kind of token") score 20-35%, not 70%. "I don't know" scores 0-10%. Parroting back corrections gets no credit. This is enforced in prompts, not code.

## Common Enhancement Patterns

### Adding a new page
1. Create `src/app/your-page/page.tsx`
2. Add to protected paths in `src/proxy.ts` (both `protectedPaths` array and `matcher`)
3. Add nav link in `src/components/Nav.tsx` if needed

### Adding a new API route
1. Create `src/app/api/your-route/route.ts`
2. Check auth: `const session = await getServerSession(authOptions); if (!session?.user) return 401`
3. Get user ID: `const userId = (session.user as { id: string }).id`
4. Use `prisma` from `@/lib/db` for DB queries
5. **Annotate all Prisma callback params explicitly** — Vercel's build will fail on implicit `any`

### Modifying the mastery model
- Decay formula: `src/lib/mastery.ts`
- Review thresholds: `getReviewThreshold()` in same file
- Sub-mastery check must be updated in THREE places: review API route, subject page reviewCount, DecayQueue component
- The overall concept `decayRate` is the average of sub-mastery decay rates (calculated in chat route)

### Modifying AI behavior
- All prompts: `src/lib/prompts.ts`
- Sub-mastery tag format: `src/lib/claude.ts` (parsing) + `src/lib/prompts.ts` (instructions to Claude)
- Scoring rules are in `SUB_MASTERY_INSTRUCTIONS` and `SCORING_RULES` constants
- The pace check is injected dynamically based on `exchangeCount` in `buildAssessPrompt()`

### Adding to the schema
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-change`
3. Run `npx prisma generate` (also runs automatically via `postinstall`)
4. Run production migration: `DATABASE_URL="prod-unpooled-string" npx prisma migrate deploy`
