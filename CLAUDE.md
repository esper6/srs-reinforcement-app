@AGENTS.md

# MEMORY.dump

Read `ARCHITECTURE.md` first — it has everything you need to understand the system, key files, gotchas, and how things connect.

## Quick Orientation
- This is an AI-powered SRS app. Users learn STEM concepts through Socratic interviews with Claude.
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
npm run build              # Production build
```

## Style
- Neo-retro theme: neon cyan/magenta/green on dark backgrounds. CSS vars in `src/app/globals.css`.
- Font: Share Tech Mono for headings/UI, Geist for body.
- Mobile-first responsive design.
