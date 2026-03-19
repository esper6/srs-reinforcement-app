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

Add to `curricula-export.json` and re-run `npm run seed`. The seed script upserts by slug so it's safe to re-run. Each concept needs a title, description, lesson markdown, and order. The AI generates all questions dynamically from the lesson markdown — no need to author prompts.
