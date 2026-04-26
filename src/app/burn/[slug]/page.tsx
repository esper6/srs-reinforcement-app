"use client";

// Subject-scoped "burn through queue" — drains the user's decay pile across
// concepts in one session, like WaniKani's review pile.
//
// Eligibility per concept (computed client-side from /api/round-queue payload):
//   - started (≥1 SubConceptMastery row): lesson-gate concepts go through
//     the regular /learn flow first so the user reads the lesson + does
//     their first round in context.
//   - not mastered, not synthesis-ready, not in synthesis cooldown: those
//     are one-shot capstone states, opt-in from the subject page.
//   - has a facet whose nextDueAt ≤ now.
//
// Pick order is the same as /api/round's pickWeakestOverdue: weakest level →
// lowest expertStage (within Expert) → most overdue. After each result we
// re-fetch the queue and pick again — naturally interleaves concepts when
// helpful and stays put when the same concept still has urgent facets.

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FacetLevel } from "@prisma/client";
import RoundView from "@/components/RoundView";
import RoundResultView from "@/components/RoundResultView";
import type { RoundResult } from "@/hooks/useRound";
import Link from "next/link";

interface FacetDTO {
  name: string;
  level: FacetLevel;
  expertStage: number;
  nextDueAt: string;
  due: boolean;
}

interface ConceptInQueue {
  id: string;
  title: string;
  description: string;
  sectionName: string;
  mastered: boolean;
  masteredAt: string | null;
  synthesisReady: boolean;
  synthesisCooldownUntil: string | null;
  started: boolean;
  facets: FacetDTO[];
  roundsDue: number;
}

interface QueueResponse {
  curriculum: { name: string; slug: string };
  concepts: ConceptInQueue[];
  totalRoundsDue: number;
}

const LEVEL_RANK: Record<FacetLevel, number> = {
  NOVICE: 0,
  APPRENTICE: 1,
  JOURNEYMAN: 2,
  EXPERT: 3,
};

interface PickedFacet {
  conceptId: string;
  conceptTitle: string;
  name: string;
  level: FacetLevel;
  expertStage: number;
}

function pickNext(concepts: ConceptInQueue[], now: Date): PickedFacet | null {
  type Candidate = PickedFacet & { nextDueAt: Date };
  const candidates: Candidate[] = [];

  for (const c of concepts) {
    if (c.mastered || c.synthesisReady || !c.started) continue;
    if (c.synthesisCooldownUntil && new Date(c.synthesisCooldownUntil) > now) continue;

    for (const f of c.facets) {
      const nextDueAt = new Date(f.nextDueAt);
      if (nextDueAt > now) continue;
      candidates.push({
        conceptId: c.id,
        conceptTitle: c.title,
        name: f.name,
        level: f.level,
        expertStage: f.expertStage,
        nextDueAt,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const lr = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (lr !== 0) return lr;
    if (a.level === FacetLevel.EXPERT) {
      const sd = a.expertStage - b.expertStage;
      if (sd !== 0) return sd;
    }
    return a.nextDueAt.getTime() - b.nextDueAt.getTime();
  });

  const { conceptId, conceptTitle, name, level, expertStage } = candidates[0];
  return { conceptId, conceptTitle, name, level, expertStage };
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; subjectName: string }
  | { kind: "round"; subjectName: string; current: PickedFacet }
  | {
      kind: "result";
      subjectName: string;
      result: RoundResult;
      previousFacet: PickedFacet;
    };

export default function BurnPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  // Re-runs on mount and after each "Next ▶" tick to pick up post-round state.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/round-queue?subject=${slug}`)
      .then((r) => r.json())
      .then((data: QueueResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in data) {
          setPageState({ kind: "error", message: data.error });
          return;
        }

        const subjectName = data.curriculum.name;
        const next = pickNext(data.concepts, new Date());
        if (!next) {
          setPageState({ kind: "empty", subjectName });
          return;
        }
        setPageState({ kind: "round", subjectName, current: next });
      })
      .catch(() => {
        if (!cancelled) setPageState({ kind: "error", message: "Failed to load queue" });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshTick]);

  const navigateBack = useCallback(() => {
    router.push(`/subject/${slug}`);
    router.refresh();
  }, [slug, router]);

  const handleRoundResolve = useCallback((result: RoundResult) => {
    setPageState((prev) => {
      if (prev.kind !== "round") return prev;
      return {
        kind: "result",
        subjectName: prev.subjectName,
        result,
        previousFacet: prev.current,
      };
    });
  }, []);

  const handleNextRound = useCallback(() => {
    setPageState({ kind: "loading" });
    setRefreshTick((t) => t + 1);
  }, []);

  const BackBar = (
    <div className="px-4 pt-3">
      <Link
        href={`/subject/${slug}`}
        className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
      >
        ← Back to subject
      </Link>
    </div>
  );

  if (pageState.kind === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  if (pageState.kind === "error") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex items-center justify-center text-red-300 px-4 text-center">
          {pageState.message}
        </div>
      </div>
    );
  }

  if (pageState.kind === "empty") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="space-y-3 max-w-md">
            <div className="text-xs text-[var(--neon-cyan)]/70 font-[family-name:var(--font-share-tech-mono)] tracking-[0.4em]">
              QUEUE CLEAR
            </div>
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] text-lg">
              {pageState.subjectName}
            </div>
            <div className="text-[var(--foreground)]/60 text-sm">
              No more rounds due in this subject. Come back later.
            </div>
            <Link
              href={`/subject/${slug}`}
              className="inline-block mt-3 px-5 py-2 bg-[var(--surface)] border border-[var(--border-retro)] text-[var(--foreground)]/70 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:border-[var(--foreground)]/30 transition-all"
            >
              Back to subject
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.kind === "round") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="px-4 pt-2 pb-1 text-xs text-[var(--neon-cyan)]/70 font-[family-name:var(--font-share-tech-mono)] tracking-wider">
          ◆ BURN · {pageState.current.conceptTitle}
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {/* key forces a fresh mount per (concept, facet) so useRound resets
             its internal session/messages state when we move to a new round. */}
          <RoundView
            key={`${pageState.current.conceptId}-${pageState.current.name}`}
            conceptId={pageState.current.conceptId}
            conceptTitle={pageState.current.conceptTitle}
            facetName={pageState.current.name}
            currentLevel={pageState.current.level}
            currentExpertStage={pageState.current.expertStage}
            onResolve={handleRoundResolve}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      {BackBar}
      <RoundResultView
        result={pageState.result}
        previousLevel={pageState.previousFacet.level}
        previousExpertStage={pageState.previousFacet.expertStage}
        // Always offer Next — handleNextRound triggers a queue refresh and
        // routes to the empty screen if nothing's left.
        hasMoreRoundsDue={true}
        onNextRound={handleNextRound}
        onExtraCredit={navigateBack}
        onDone={navigateBack}
        showExtraCredit={false}
      />
    </div>
  );
}
