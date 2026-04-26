"use client";

import { FacetLevel } from "@prisma/client";
import { advance, drop, getInterval } from "@/lib/levels";
import type { RoundResult } from "@/hooks/useRound";

interface RoundResultViewProps {
  result: RoundResult;
  previousLevel: FacetLevel;
  previousExpertStage: number;
  hasMoreRoundsDue: boolean;
  onNextRound: () => void;
  onExtraCredit: () => void;
  onDone: () => void;
}

const LEVEL_LABEL: Record<FacetLevel, string> = {
  NOVICE: "Novice",
  APPRENTICE: "Apprentice",
  JOURNEYMAN: "Journeyman",
  EXPERT: "Expert",
};

function formatLevelState(level: FacetLevel, expertStage: number): string {
  if (level === FacetLevel.EXPERT) return `Expert ${expertStage}/3`;
  return LEVEL_LABEL[level];
}

// Humanize an ms duration. Used to show "next review in 4 days" etc.
function formatInterval(ms: number): string {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (ms < WEEK) {
    const days = Math.round(ms / DAY);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (ms < 30 * DAY) {
    const weeks = Math.round(ms / WEEK);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const months = Math.round(ms / (30 * DAY));
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export default function RoundResultView({
  result,
  previousLevel,
  previousExpertStage,
  hasMoreRoundsDue,
  onNextRound,
  onExtraCredit,
  onDone,
}: RoundResultViewProps) {
  const previousState = { level: previousLevel, expertStage: previousExpertStage };
  const newState =
    result.outcome === "advance" ? advance(previousState) : drop(previousState);
  const previousLabel = formatLevelState(previousLevel, previousExpertStage);
  const newLabel = formatLevelState(newState.level, newState.expertStage);
  const intervalLabel = formatInterval(getInterval(newState));

  const isAdvance = result.outcome === "advance";
  const accent = isAdvance ? "text-[var(--neon-green)]" : "text-[var(--neon-magenta)]";
  const symbol = isAdvance ? "✓" : "↓";

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8">
      <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-6 space-y-6">
        <div className="text-center">
          <div className={`text-4xl ${accent}`}>{symbol}</div>
          <div className="text-xs text-[var(--foreground)]/50 mt-2 font-[family-name:var(--font-share-tech-mono)] tracking-widest">
            ROUND COMPLETE
          </div>
        </div>

        <div className="text-center">
          <div className="text-[var(--neon-cyan)] text-lg font-[family-name:var(--font-share-tech-mono)]">
            {result.name}
          </div>
          <div className="mt-2 text-sm font-[family-name:var(--font-share-tech-mono)]">
            <span className="text-[var(--foreground)]/50">{previousLabel}</span>
            <span className="mx-3 text-[var(--foreground)]/30">──→</span>
            <span className={accent}>{newLabel}</span>
          </div>
          <div className="text-xs text-[var(--foreground)]/40 mt-3">
            Next review in {intervalLabel}
          </div>
        </div>

        <div className="space-y-2 pt-2">
          {hasMoreRoundsDue && (
            <button
              onClick={onNextRound}
              className="w-full px-4 py-3 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all duration-200"
            >
              ▶ Next round
            </button>
          )}
          <button
            onClick={onExtraCredit}
            className="w-full px-4 py-3 bg-[var(--surface-light)] border border-[var(--border-retro)] text-[var(--foreground)]/80 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--surface-light)]/80 transition-all duration-200"
          >
            ◆ Extra Credit on {result.name}
          </button>
          <button
            onClick={onDone}
            className="w-full px-4 py-2 text-[var(--foreground)]/50 hover:text-[var(--foreground)]/80 font-[family-name:var(--font-share-tech-mono)] text-sm transition-colors"
          >
            ✕ Done for now
          </button>
        </div>
      </div>
    </div>
  );
}
