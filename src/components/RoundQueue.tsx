import Link from "next/link";
import { FacetLevel } from "@prisma/client";

// Server component — pure presentational. Server pages or API consumers compute
// the round-queue data and pass it in.

interface FacetSummary {
  name: string;
  level: FacetLevel;
  expertStage: number;
  due: boolean;
}

interface ConceptRoundState {
  id: string;
  title: string;
  facets: FacetSummary[];
  roundsDue: number;
  mastered: boolean;
  synthesisReady: boolean;
  // Whether the user has any SubConceptMastery rows for this concept.
  // Lesson-gate concepts (started=false) need explicit lesson read first;
  // they are not part of the burn pile and shouldn't display as "X rounds".
  started: boolean;
}

interface RoundQueueProps {
  concepts: ConceptRoundState[];
  totalRoundsDue: number;
  slug: string;
}

const LEVEL_RANK: Record<FacetLevel, number> = {
  NOVICE: 1,
  APPRENTICE: 2,
  JOURNEYMAN: 3,
  EXPERT: 4,
};

const LEVEL_SHORT: Record<FacetLevel, string> = {
  NOVICE: "Nov",
  APPRENTICE: "App",
  JOURNEYMAN: "Jrny",
  EXPERT: "Exp",
};

function FacetPips({ facet }: { facet: FacetSummary }) {
  const filled = LEVEL_RANK[facet.level];
  const dueAccent = facet.due ? "text-[var(--neon-magenta)]" : "text-[var(--foreground)]/60";
  const pipColor = facet.due ? "bg-[var(--neon-magenta)]" : "bg-[var(--neon-cyan)]/60";

  const stageLabel =
    facet.level === FacetLevel.EXPERT ? `Exp ${facet.expertStage}/3` : LEVEL_SHORT[facet.level];

  return (
    <div className="flex flex-col items-center gap-1 min-w-0 px-1">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${
              i <= filled ? pipColor : "bg-[var(--foreground)]/15"
            }`}
          />
        ))}
      </div>
      <div
        className={`text-[10px] truncate max-w-[6rem] font-[family-name:var(--font-share-tech-mono)] ${dueAccent}`}
        title={facet.name}
      >
        {facet.name}
      </div>
      <div className="text-[10px] text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)]">
        {stageLabel}
        {facet.due && <span className="text-[var(--neon-magenta)] ml-1">· due</span>}
      </div>
    </div>
  );
}

export default function RoundQueue({ concepts, totalRoundsDue, slug }: RoundQueueProps) {
  // Mastered concepts live in BurnedShelf below; hide them here so the active
  // queue stays focused on what still needs work.
  const visible = concepts.filter((c) => c.facets.length > 0 && !c.mastered);
  if (visible.length === 0) return null;

  return (
    <div className="mt-8 mb-6">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--foreground)] opacity-50 uppercase tracking-wider">
          Round Queue
        </h2>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)]">
            {totalRoundsDue} round{totalRoundsDue === 1 ? "" : "s"} due
          </span>
          {totalRoundsDue > 0 && (
            <Link
              href={`/burn/${slug}`}
              className="text-xs px-2.5 py-1 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all"
            >
              Burn through ▶
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((c) => {
          const isStartable = !c.mastered && (c.roundsDue > 0 || !c.started);
          const status = c.mastered
            ? "Mastered ✓"
            : c.synthesisReady
              ? "Synthesis ready"
              : !c.started
                ? "Not started"
                : c.roundsDue > 0
                  ? `${c.roundsDue} round${c.roundsDue === 1 ? "" : "s"}`
                  : "Up to date";

          return (
            <div
              key={c.id}
              className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[var(--foreground)] text-sm font-medium truncate">
                    {c.title}
                  </span>
                  <span className="text-xs text-[var(--foreground)]/40 ml-3 shrink-0 font-[family-name:var(--font-share-tech-mono)]">
                    {status}
                  </span>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {c.facets.map((f) => (
                    <FacetPips key={f.name} facet={f} />
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                {c.mastered ? (
                  <span className="text-[var(--neon-green)] text-2xl">✓</span>
                ) : c.synthesisReady ? (
                  <Link
                    href={`/learn/${c.id}`}
                    className="px-3 py-1.5 bg-[var(--neon-magenta)]/10 border border-[var(--neon-magenta)]/40 text-[var(--neon-magenta)] rounded text-xs font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-magenta)]/20"
                  >
                    Synthesis ▶
                  </Link>
                ) : isStartable ? (
                  <Link
                    href={`/learn/${c.id}`}
                    className="px-3 py-1.5 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded text-xs font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20"
                  >
                    Start ▶
                  </Link>
                ) : (
                  <span className="text-[var(--foreground)]/30 text-xs font-[family-name:var(--font-share-tech-mono)]">
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
