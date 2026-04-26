# Rounds Redesign

Status: **Design locked. Not yet implemented.**
Owner: gwinchester
Last updated: 2026-04-25

This is the working spec for the curriculum-engine refactor. The vocab SRS side is untouched.

## Why

The current Socratic curriculum mode is meandering and unrewarding. Diagnosis:

1. **Mastery feels arbitrary.** 3-5 facets each at 0-100% with vague jumps — users can't predict what advances them, so the score doesn't feel earned.
2. **Conversations have no visible structure.** A 4-8 exchange interview with no progress markers feels like a tunnel.
3. **Openers are fluffy.** "Tell me what you understand about X" before anything has happened invites either rambling or "I don't know."
4. **One concept = one big commitment.** Forces a 20-30 min interview every session even when the user has 5 minutes.

The vocab SRS works because every interaction is **bounded, predictable, earnable**, and the queue **drains visibly**. We're applying that pattern to concepts.

## The new model

### Levels (per facet)

Four discrete levels. Each level has a clear bar Claude evaluates against.

| Level | What it means | Bar |
|---|---|---|
| **Novice** | You've encountered it | Can articulate the basic idea |
| **Apprentice** | You can explain it | Can identify when it applies |
| **Journeyman** | You can apply it | Can reason about tradeoffs / edge cases |
| **Expert** | You can teach it | Can connect to other facets, anticipate failure modes |

Plus one concept-level badge: **Mastered** — earned only by passing a synthesis round when all facets are at Expert stage 3.

### Intervals (when a facet comes due again)

| Level | Re-due in |
|---|---|
| Novice | 4h |
| Apprentice | 1d |
| Journeyman | 4d |
| Expert stage 1 | 2w |
| Expert stage 2 | 1mo |
| Expert stage 3 | 3mo |
| Mastered | never (burned) |

The Expert staircase: each successful Expert review pushes the next interval further out. After stage 3, the facet is eligible to participate in the synthesis round. **Synthesis pass = concept Mastered.**

Minimum journey from Novice to Mastered: ~5 months elapsed, ~6-7 rounds touched.

### Advancement

- **Each round = one attempt at one facet.**
- **Correct → +1 level.** Claude judges binary against the level's bar.
- **Wrong → -1 level** (floor at Novice).
- Within the Expert staircase, correct advances to the next stage; wrong drops you to Journeyman (still -1 level by our naming).

The drop rule is uniform — no "drop 2 at higher levels." We can revisit if it feels too easy.

### Synthesis round

- **Unlocks** when all facets in a concept are at Expert stage 3.
- **Pass** → concept becomes **Mastered**, no further reviews on any facet.
- **Fail** → no drops. Cooldown of **1 week** before retry.

The "no drops" decision: synthesis attempts are valuable practice. Punishing them would discourage retry. The cooldown alone provides spacing.

## Conversation engine: rounds

### Round structure

A round is the unit of engagement. ~2-5 minutes. Replaces the long-form interview entirely.

1. App auto-picks the **weakest overdue facet** for the chosen concept (user can override later if we add a picker).
2. Claude poses **one concrete scenario or question** anchored in the lesson markdown — targeted at the bar for the user's *next* level.
3. Up to **2 follow-ups** if the answer is partial. Hard cap at 3 questions per round.
4. Claude resolves to **advance / hold / drop** within those 3 questions. No exploratory wandering.
5. Result screen: "Round complete: {Facet} → {New Level}" (or held/dropped).
6. User chooses: **another round** (next weakest) · **Extra Credit** on this facet · **done**.

### What ends a round

Capped at 1-3 questions, Claude decides when it has enough signal. Hard rule in the prompt: **must resolve to a level decision within 3 questions**. No stalling, no fishing.

### Opening question style

Concrete > abstract. Source from the lesson markdown's examples.

- ✅ "You're designing a payment system. A user clicks 'pay' twice. What's your strategy and why?"
- ❌ "Tell me what you understand about idempotence."

Prompt instructions push Claude toward scenarios, not invitations to lecture.

### Extra Credit (preserved)

Available **after each round**, not just at end-of-concept. Same warm-palette, no-mastery-impact mode as today. The natural moment is right after a level resolution, while the facet is still hot.

## UI changes

### Decay queue (replaces current list)

```
┌─────────────────────────────────────────────────────┐
│ Distributed Systems                       3 rounds  │
│ ●●●○  ●●○○  ●●●●  ●○○○                 ▶ Start    │
│ Consist. Avail.   Partit.   CAP                     │
│ (Jrny)  (App)    (Expert)  (Nov, due!)              │
├─────────────────────────────────────────────────────┤
│ Idempotence                               1 round   │
│ ●●●○  ●●●○                              ▶ Start    │
│ Defn.   Retries                                     │
│ (Jrny, due!) (Jrny)                                 │
└─────────────────────────────────────────────────────┘

[ Burn through queue → ]   12 rounds total
```

Key shifts:
- Unit is **rounds**, not concepts. "12 rounds due" feels like a stack of cards, not a stack of essays.
- Each concept shows its facet levels at a glance (pip chart). Overdue facets highlighted.
- One-click **Start** auto-picks the weakest overdue facet.
- **Burn through queue** chains rounds across concepts, like draining a WaniKani review pile.

Replaces `src/components/DecayQueue.tsx` and the queue-button area on `src/app/subject/[slug]/page.tsx`.

### Round flow

A new compact view replacing the current `ChatInterface` for assessment/review modes:

```
┌────────────────────────────────────────┐
│ Distributed Systems → Consistency       │
│ Apprentice ───→ ?                      │
│                                         │
│  Q1/3:                                  │
│  "You're running a global database..."  │
│                                         │
│  [ user types here ]                    │
└────────────────────────────────────────┘
```

After Claude resolves:

```
┌────────────────────────────────────────┐
│ ✓ Round complete                        │
│ Consistency: Apprentice → Journeyman    │
│ Next review in 4 days                   │
│                                         │
│ ▶ Next round (Availability, due)        │
│ ◆ Extra Credit on Consistency           │
│ ✕ Done for now                          │
└────────────────────────────────────────┘
```

`ChatInterface` stays around for Extra Credit mode (which still feels like a chat). Round mode is its own component.

### Lesson visibility

The user opts into study; they never get the lesson shoved at them inside a test context. Strict separation between **study** (lesson visible) and **test** (lesson hidden) — the WaniKani principle that makes levels feel earned.

| Context | Show lesson? | Why |
|---|---|---|
| Round (any level) | ❌ Never | Showing material seconds before recall measures reading comprehension, not durable knowledge — poisons the well |
| Synthesis round | ❌ Never | Higher stakes, same logic |
| First encounter (before round 1 on a new concept) | ✅ Explicit "study" gate | Concept page detects no SubConceptMastery rows yet → shows "📖 Read the Lesson" → user reads → "Start round" begins round 1 |
| Extra Credit (after a round resolves) | ✅ Available, expandable | Already tested; can dig in with the source open without affecting mastery |
| Standalone "Read" button on the concept page | ✅ Always | User explicitly choosing to study, not in a test context |

For Phase 3 implementation: the round UI must NOT carry over the legacy `ChatInterface` show-lesson expandable. That's an Extra-Credit-only affordance.

## Schema changes

### Replace `score` with `level` on `SubConceptMastery`

```prisma
enum FacetLevel {
  NOVICE
  APPRENTICE
  JOURNEYMAN
  EXPERT
}

model SubConceptMastery {
  id               String         @id @default(cuid())
  conceptMasteryId String
  name             String
  level            FacetLevel     @default(NOVICE)
  expertStage      Int            @default(0)   // 0 = not at Expert; 1-3 = staircase position
  nextDueAt        DateTime       @default(now())
  lastReviewedAt   DateTime       @default(now())
  // remove: score, decayRate
  conceptMastery   ConceptMastery @relation(...)
  @@unique([conceptMasteryId, name])
  @@index([conceptMasteryId])
  @@index([nextDueAt])
}
```

### Add `mastered` flag to `ConceptMastery`

```prisma
model ConceptMastery {
  id             String   @id @default(cuid())
  userId         String
  conceptId      String
  mastered       Boolean  @default(false)
  masteredAt     DateTime?
  synthesisCooldownUntil DateTime?  // set when synthesis fails
  // remove: score, decayRate
  reviewCount    Int      @default(0)
  lastReviewedAt DateTime @default(now())
  ...
}
```

### Add `ROUND` and `SYNTHESIS` to SessionMode

```prisma
enum SessionMode {
  ASSESS    // legacy, retained for old data
  LEARN     // legacy
  REVIEW    // legacy
  ROUND
  SYNTHESIS
  EXTRA_CREDIT
}
```

(Could collapse the legacy modes during migration. See migration plan.)

### Migration: wipe existing mastery data

User explicitly OK'd this. Cleaner than mapping % to levels.

```sql
-- In a Prisma migration:
DELETE FROM "SubConceptMastery";
DELETE FROM "ConceptMastery";
DELETE FROM "ChatSession" WHERE mode IN ('ASSESS', 'LEARN', 'REVIEW');
DELETE FROM "ChatMessage" WHERE chatSessionId NOT IN (SELECT id FROM "ChatSession");
```

Vocab progress (`UserVocabProgress`) untouched — that side is working and stays.

## Prompt changes

### New prompts to write

- `buildRoundPrompt(facetName, currentLevel, conceptTitle, lessonMarkdown)` — replaces `buildAssessPrompt` / `buildLearnPrompt` / `buildReviewPrompt`. Targets one facet, one level transition, 1-3 questions, binary resolution.
- `buildSynthesisPrompt(conceptTitle, facetNames, lessonMarkdown)` — cross-facet integration question. Single round, harder bar.
- `buildExtraCreditPrompt` — keep as-is (already works).

### Tag format change

Replace `<sub_mastery name="..." score="X" decay_rate="Y" />` with:

```xml
<round_result name="Consistency" outcome="advance" />
<!-- outcome: advance | drop (binary — Claude must commit to a call within 3 questions) -->
```

Synthesis returns one of:

```xml
<synthesis_result outcome="pass" />
<synthesis_result outcome="fail" />
```

`src/lib/claude.ts` parsers update accordingly. Old `parseMasteryTag` / `parseSubMasteryTags` can be deleted once migration is done.

### Scoring rules → Bar criteria

`SCORING_RULES` constant becomes `LEVEL_BARS` — describes what each level requires, not how to score 0-100. Claude no longer calibrates percentages; it just checks "did this clear the bar for {nextLevel}?"

## Build plan

Phased so each chunk lands in a working state. **Tests + manual playtest after each.**

### Phase 0 — Doc and design freeze ✓
- [x] `docs/rounds-redesign.md` (this file)
- [x] `ARCHITECTURE.md` callout pointing here

### Phase 1 — Schema + migration ✓
- [x] Add `FacetLevel` enum, `level`/`expertStage`/`nextDueAt` columns to `SubConceptMastery`
- [x] Add `mastered`/`masteredAt`/`synthesisCooldownUntil` to `ConceptMastery`
- [x] Add `ROUND`/`SYNTHESIS`/`EXTRA_CREDIT` to `SessionMode` enum
- [x] Wipe existing mastery + non-Extra-Credit chat data via migration (`prisma/migrations/20260426032235_rounds_phase_1`)
- [x] Migration created, build verified locally. Apply on VM via `git push develop` → GH action runs `prisma migrate deploy` against `srsapp-dev`.

**Approach note:** Phase 1 is **additive**. Legacy `score`/`decayRate`/`lastReviewedAt` columns kept on both `ConceptMastery` and `SubConceptMastery` so existing code (mastery.ts, chat route, DecayQueue, etc.) keeps building. Removed in Phase 6 cleanup.

### Phase 2 — Round engine (backend) ✓
- [x] `src/lib/levels.ts` — pure functions: `getInterval`, `advance`, `drop`, `nextDueAt`, `isSynthesisReady`, `SYNTHESIS_COOLDOWN_MS`
- [x] `src/lib/prompts.ts` — `buildRoundPrompt`, `buildSynthesisPrompt` (legacy assess/learn/review kept until Phase 6 cleanup)
- [x] `src/lib/claude.ts` — `parseRoundResult` / `parseSynthesisResult` + strip helpers (legacy parsers kept)
- [x] `POST /api/round` — picks weakest overdue facet, streams round prompt, applies advance/drop on `<round_result>`
- [x] `POST /api/synthesis` — eligibility check (all facets at Expert/3, not on cooldown, not Mastered), pass→Mastered, fail→1w cooldown (no facet drops)
- [x] `GET /api/round-queue?subject=slug` — returns per-concept facet states + roundsDue + synthesisReady for the decay queue UI

**Phase 2.0 (added during execution)** — facets contract on Concept:
- [x] `Concept.facets String[]` column + migration
- [x] `docs/curriculum-generator-prompt.md` requires Facets array matching `####` headings
- [x] `/api/import-curriculum` validates the contract; refuses imports without it
- [x] `/import` page mirrors the prompt + shows facet count in preview

User action remaining before Phase 3 can be smoke-tested end-to-end: regenerate at least one curriculum (System Design recommended) using the updated prompt and re-import via `/import`. Existing curricula have empty `facets[]` and the round endpoints will refuse them with a clear error.

### Phase 3 — Round UI ✓
- [x] `useRound` hook (SSE streaming, X-Facet-Name header, round_result parsing)
- [x] `RoundView` — bounded round UI with facet header, Q1/3 counter, hard pacing
- [x] `RoundResultView` — post-round screen with three actions (next / extra credit / done)
- [x] Wired `/learn/[conceptId]` to a state machine over loading → gate → round → result
- [x] `LessonGate` for first-encounter (per "Lesson visibility" rule above)
- [x] `/review` left on legacy chat — gets retired in Phase 6 cleanup, not Phase 3

### Phase 4 — Decay queue UI ✓
- [x] New `RoundQueue.tsx` with per-concept pip-chart (4 pips per facet, due highlighted in magenta)
- [x] Subject page rewrites: drops `DecayQueue` import, computes round-queue data inline from new schema, renders `RoundQueue`
- [x] `reviewCount` on `SubjectQueueButtons` driven by `totalRoundsDue`
- [ ] "Burn through queue" chained-rounds flow — deferred (the pip chart already conveys the queue; the chain is a nice-to-have)

### Phase 5 — Synthesis round ✓
- [x] `useSynthesis` hook + `SynthesisView` capstone UI
- [x] `SynthesisResultView` — pass = MASTERED celebration, fail = 1-week cooldown screen
- [x] Page state machine adds `synthesis_gate` (all-facets-at-Expert/3 CTA), `synthesis_cooldown`, `synthesis_in_progress`, `synthesis_result`
- [x] Cooldown enforced server-side in `/api/synthesis`; surfaced in UI

### Phase 5b — Extra Credit wiring (added during execution) ✓
- [x] `useChat` and `ChatInterface` accept `initialExtraCredit` to start in extra-credit mode without an assessment trigger
- [x] Page `extra_credit` state replaces the placeholder alert with a real chat surface

### Phase 6 — Cleanup (pending — defer until smoke-test validates Phases 3-5)
- [ ] Remove `buildAssessPrompt` / `buildLearnPrompt` / `buildReviewPrompt` from `src/lib/prompts.ts` and the constants they reference (`SCORING_RULES`, `WRAPUP_FORMAT`, `SUB_MASTERY_FORMAT`)
- [ ] Remove `parseMasteryTag` / `parseSubMasteryTags` and their strip helpers from `src/lib/claude.ts`
- [ ] Drop `score` / `decayRate` columns from `ConceptMastery` and `SubConceptMastery` (migration); remove `src/lib/mastery.ts` if nothing else needs it
- [ ] Remove `ASSESS` / `LEARN` / `REVIEW` from `SessionMode` enum (migration); update `/api/chat` to be Extra-Credit-only
- [ ] Delete `DecayQueue.tsx`, `MasteryBar.tsx`, `SubMasteryBreakdown.tsx` if no remaining importers
- [ ] Delete `/review` page and `/api/review` route; remove the Reviews button on `SubjectQueueButtons` (or repurpose to "Rounds")
- [ ] Update `ARCHITECTURE.md` and `CLAUDE.md` to drop the "Phases 1-5 live, Phase 6 pending" callout and describe the new system as canonical without legacy callouts

## Open questions deferred

- **Exact decay intervals** — proposed values are reasonable starting points; tune after playtest.
- **Synthesis question shape** — one big scenario, or several integration probes? Decide during Phase 5.
- **User-pick facet override** — auto by default; add a manual picker only if users complain.
- **Burn-through-queue limits** — should the chain auto-stop after N rounds? Probably yes (~10) to prevent fatigue.
- **What "wrong at Novice" does** — currently floors at Novice with same 4h interval. Could optionally extend the next-due interval after consecutive Novice failures, but probably overkill.
- **Curriculum generator-prompt improvements** — Stir Trek's overlapping subjects suggest the generator needs orthogonality constraints. Separate workstream.

## Non-goals

- Redesigning vocab SRS — it works, leave it alone.
- Migrating existing mastery scores — explicit decision to wipe.
- Multiple concurrent rounds across concepts in one screen — single round at a time keeps UX clean.
- Mobile-specific round UI — current responsive patterns should carry over.
