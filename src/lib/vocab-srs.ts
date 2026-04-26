// Adaptive SRS engine for vocab drill.
// Intervals are in hours. Stages are derived from interval, never stored.
//
// Stage names mirror the rounds engine (Novice → Apprentice → Journeyman →
// Expert) so a single mental model carries across both surfaces. Bucket
// thresholds match lesson interval boundaries from src/lib/levels.ts:
// 4h NOVICE, 1d APPRENTICE, 4d JOURNEYMAN, 2w EXPERT/1, 90d EXPERT/3 (Burned).
// The underlying SM-2 math is unchanged — this is display alignment only.

export type VocabStage = "Novice" | "Apprentice" | "Journeyman" | "Expert" | "Burned";

export const STAGE_COLORS: Record<VocabStage, string> = {
  Novice: "var(--foreground)",
  Apprentice: "var(--neon-magenta)",
  Journeyman: "var(--neon-cyan)",
  Expert: "var(--neon-purple)",
  Burned: "var(--extra-credit-accent)",
};

const DEFAULT_INTERVAL = 4; // hours
const MIN_EASE_FACTOR = 1.3;

export interface VocabProgressUpdate {
  streak: number;
  easeFactor: number;
  interval: number;
  nextReviewAt: Date;
  totalCorrect: number;
  totalWrong: number;
}

interface CurrentProgress {
  streak: number;
  easeFactor: number;
  interval: number;
  totalCorrect: number;
  totalWrong: number;
}

export function processCorrect(p: CurrentProgress): VocabProgressUpdate {
  const newInterval = p.interval * p.easeFactor;
  return {
    streak: p.streak + 1,
    easeFactor: p.easeFactor,
    interval: newInterval,
    nextReviewAt: new Date(Date.now() + newInterval * 60 * 60 * 1000),
    totalCorrect: p.totalCorrect + 1,
    totalWrong: p.totalWrong,
  };
}

export function processWrong(p: CurrentProgress): VocabProgressUpdate {
  return {
    streak: 0,
    easeFactor: Math.max(MIN_EASE_FACTOR, p.easeFactor - 0.2),
    interval: DEFAULT_INTERVAL,
    nextReviewAt: new Date(Date.now() + DEFAULT_INTERVAL * 60 * 60 * 1000),
    totalCorrect: p.totalCorrect,
    totalWrong: p.totalWrong + 1,
  };
}

export function getStage(intervalHours: number): VocabStage {
  if (intervalHours < 24) return "Novice";          // < 1 day
  if (intervalHours < 96) return "Apprentice";      // 1d to <4d
  if (intervalHours < 336) return "Journeyman";     // 4d to <2w
  if (intervalHours < 2160) return "Expert";        // 2w to <90d
  return "Burned";                                  // ≥ 90d
}
