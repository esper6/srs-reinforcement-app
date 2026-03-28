// Adaptive SRS engine for vocab drill.
// Intervals are in hours. Stages are derived from interval, never stored.

export type VocabStage = "Apprentice" | "Journeyman" | "Adept" | "Master" | "Burned";

export const STAGE_COLORS: Record<VocabStage, string> = {
  Apprentice: "var(--neon-magenta)",
  Journeyman: "var(--neon-cyan)",
  Adept: "var(--neon-green)",
  Master: "var(--neon-purple)",
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
  if (intervalHours < 24) return "Apprentice";
  if (intervalHours < 144) return "Journeyman";   // 1-6 days
  if (intervalHours < 504) return "Adept";          // 7-21 days
  if (intervalHours < 2160) return "Master";        // 22-90 days
  return "Burned";
}
