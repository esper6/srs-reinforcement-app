// Pure level/interval/advancement logic for the rounds redesign.
// See docs/rounds-redesign.md for the design rationale.

import { FacetLevel } from "@prisma/client";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// Indexed by expertStage (1..3). Index 0 is null because stage 0 means
// "not yet at Expert" — used as the default for non-Expert facets.
const EXPERT_STAGE_INTERVALS = [
  null,
  2 * WEEK,
  30 * DAY,
  90 * DAY,
] as const;

export const SYNTHESIS_COOLDOWN_MS = 7 * DAY;

export type FacetState = {
  level: FacetLevel;
  expertStage: number;
};

export function getInterval({ level, expertStage }: FacetState): number {
  switch (level) {
    case FacetLevel.NOVICE:
      return 4 * HOUR;
    case FacetLevel.APPRENTICE:
      return 1 * DAY;
    case FacetLevel.JOURNEYMAN:
      return 4 * DAY;
    case FacetLevel.EXPERT: {
      const ms = EXPERT_STAGE_INTERVALS[expertStage];
      if (ms == null) {
        throw new Error(`Invalid expertStage ${expertStage} for EXPERT level`);
      }
      return ms;
    }
  }
}

export function advance({ level, expertStage }: FacetState): FacetState {
  switch (level) {
    case FacetLevel.NOVICE:
      return { level: FacetLevel.APPRENTICE, expertStage: 0 };
    case FacetLevel.APPRENTICE:
      return { level: FacetLevel.JOURNEYMAN, expertStage: 0 };
    case FacetLevel.JOURNEYMAN:
      return { level: FacetLevel.EXPERT, expertStage: 1 };
    case FacetLevel.EXPERT:
      // Cap at stage 3 — the synthesis round is what masters the concept,
      // not further facet-level progression.
      return { level: FacetLevel.EXPERT, expertStage: Math.min(expertStage + 1, 3) };
  }
}

// Drop is uniformly -1 level (floor at Novice). From any Expert stage you
// land at Journeyman/0 — the staircase doesn't get partial credit.
export function drop({ level }: FacetState): FacetState {
  switch (level) {
    case FacetLevel.NOVICE:
    case FacetLevel.APPRENTICE:
      return { level: FacetLevel.NOVICE, expertStage: 0 };
    case FacetLevel.JOURNEYMAN:
      return { level: FacetLevel.APPRENTICE, expertStage: 0 };
    case FacetLevel.EXPERT:
      return { level: FacetLevel.JOURNEYMAN, expertStage: 0 };
  }
}

export function nextDueAt(state: FacetState, now: Date = new Date()): Date {
  return new Date(now.getTime() + getInterval(state));
}

export function isSynthesisReady(state: FacetState): boolean {
  return state.level === FacetLevel.EXPERT && state.expertStage === 3;
}
