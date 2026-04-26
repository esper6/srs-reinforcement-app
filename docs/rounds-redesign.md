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

### Phase 2 — Round engine (backend)
- [ ] `src/lib/levels.ts` — pure functions: `getInterval(level, stage)`, `advance(level, stage)`, `drop(level, stage)`, `nextDueAt(level, stage, now)`
- [ ] `src/lib/prompts.ts` — `buildRoundPrompt`, `buildSynthesisPrompt`. Delete `buildAssessPrompt`/`buildLearnPrompt`/`buildReviewPrompt` (or stub them out for back-compat during build).
- [ ] `src/lib/claude.ts` — new `parseRoundResult` / `parseSynthesisResult`. Strip handling.
- [ ] `POST /api/round` — picks weakest overdue facet for a concept, opens session, streams prompt. Returns `roundResult` on completion.
- [ ] `POST /api/synthesis` — opens synthesis session for a concept where all facets are at Expert stage 3.
- [ ] `GET /api/round-queue?subject=slug` — returns concepts with their facet states for the decay queue UI.

### Phase 3 — Round UI
- [ ] New `RoundView` component replacing `ChatInterface` for ROUND/SYNTHESIS modes
- [ ] Round result screen with three actions (next / extra credit / done)
- [ ] Wire up `/learn/[conceptId]` and `/review` to use `RoundView`
- [ ] Keep `ChatInterface` only for Extra Credit mode

### Phase 4 — Decay queue UI
- [ ] Replace `DecayQueue.tsx` with the pip-chart layout
- [ ] Update `src/app/subject/[slug]/page.tsx` to use the new queue
- [ ] "Burn through queue" chained-rounds flow

### Phase 5 — Synthesis round
- [ ] Unlock detection: all facets at Expert stage 3
- [ ] Synthesis prompt + flow
- [ ] Mastered badge on concept
- [ ] Cooldown enforcement (1 week)

### Phase 6 — Cleanup
- [ ] Remove dead prompt functions, dead parsers, dead API routes
- [ ] Remove old mastery columns once nothing references them
- [ ] Update `ARCHITECTURE.md` and `CLAUDE.md` to describe new system as the live one (not "redesign in progress")

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
