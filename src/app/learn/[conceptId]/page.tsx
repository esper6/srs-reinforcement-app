"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { FacetLevel } from "@prisma/client";
import LessonGate from "@/components/LessonGate";
import RoundView from "@/components/RoundView";
import RoundResultView from "@/components/RoundResultView";
import type { RoundResult } from "@/hooks/useRound";

interface SubMasteryDTO {
  name: string;
  level: FacetLevel;
  expertStage: number;
  nextDueAt: string;
}

interface MasteryDTO {
  mastered: boolean;
  masteredAt: string | null;
  synthesisCooldownUntil: string | null;
  subMasteries: SubMasteryDTO[];
}

interface ConceptResponse {
  id: string;
  title: string;
  description: string;
  lessonMarkdown: string;
  facets: string[];
  section: { name: string; curriculum: { name: string; slug: string } };
  mastery: MasteryDTO | null;
}

interface ResolvedFacet {
  name: string;
  level: FacetLevel;
  expertStage: number;
  nextDueAt: Date;
  due: boolean;
}

const LEVEL_RANK: Record<FacetLevel, number> = {
  NOVICE: 0,
  APPRENTICE: 1,
  JOURNEYMAN: 2,
  EXPERT: 3,
};

function resolveFacets(concept: ConceptResponse, now: Date): ResolvedFacet[] {
  const subByName = new Map<string, SubMasteryDTO>(
    concept.mastery?.subMasteries.map((s) => [s.name, s]) ?? []
  );
  return concept.facets.map((name) => {
    const sub = subByName.get(name);
    const level = sub?.level ?? FacetLevel.NOVICE;
    const expertStage = sub?.expertStage ?? 0;
    const nextDueAt = sub?.nextDueAt ? new Date(sub.nextDueAt) : new Date(0);
    return { name, level, expertStage, nextDueAt, due: nextDueAt <= now };
  });
}

function pickWeakestOverdue(facets: ResolvedFacet[]): ResolvedFacet | null {
  const overdue = facets.filter((f) => f.due);
  if (overdue.length === 0) return null;
  overdue.sort((a, b) => {
    const lr = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (lr !== 0) return lr;
    if (a.level === FacetLevel.EXPERT) {
      const sd = a.expertStage - b.expertStage;
      if (sd !== 0) return sd;
    }
    return a.nextDueAt.getTime() - b.nextDueAt.getTime();
  });
  return overdue[0];
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "needs_reimport" }
  | { kind: "mastered" }
  | { kind: "no_rounds_due" }
  | { kind: "lesson_gate" }
  | { kind: "round"; facet: ResolvedFacet }
  | { kind: "result"; result: RoundResult; previousFacet: ResolvedFacet };

export default function LearnPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params.conceptId as string;
  const [concept, setConcept] = useState<ConceptResponse | null>(null);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  // Re-fetch concept + mastery state when refreshTick changes (after a round resolves)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/concept/${conceptId}`)
      .then((r) => r.json())
      .then((data: ConceptResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in data) {
          setPageState({ kind: "error", message: data.error });
          return;
        }
        setConcept(data);

        if (data.facets.length === 0) {
          setPageState({ kind: "needs_reimport" });
          return;
        }
        if (data.mastery?.mastered) {
          setPageState({ kind: "mastered" });
          return;
        }
        const hasAnyMastery = (data.mastery?.subMasteries.length ?? 0) > 0;
        if (!hasAnyMastery) {
          setPageState({ kind: "lesson_gate" });
          return;
        }
        const facets = resolveFacets(data, new Date());
        const weakest = pickWeakestOverdue(facets);
        if (!weakest) {
          setPageState({ kind: "no_rounds_due" });
          return;
        }
        setPageState({ kind: "round", facet: weakest });
      })
      .catch(() => {
        if (!cancelled) setPageState({ kind: "error", message: "Failed to load concept" });
      });
    return () => {
      cancelled = true;
    };
  }, [conceptId, refreshTick]);

  const navigateBack = useCallback(() => {
    const slug = concept?.section.curriculum.slug;
    if (slug) {
      router.push(`/subject/${slug}`);
      router.refresh();
    } else {
      router.back();
    }
  }, [concept, router]);

  const handleStartFromGate = useCallback(() => {
    if (!concept) return;
    const facets = resolveFacets(concept, new Date());
    const weakest = pickWeakestOverdue(facets);
    if (!weakest) {
      setPageState({ kind: "no_rounds_due" });
      return;
    }
    setPageState({ kind: "round", facet: weakest });
  }, [concept]);

  const handleRoundResolve = useCallback((result: RoundResult) => {
    setPageState((prev) => {
      if (prev.kind !== "round") return prev;
      return { kind: "result", result, previousFacet: prev.facet };
    });
  }, []);

  const handleNextRound = useCallback(() => {
    // Re-fetch — server has applied the level transition, picks next weakest from new state
    setPageState({ kind: "loading" });
    setRefreshTick((t) => t + 1);
  }, []);

  const handleExtraCredit = useCallback(() => {
    // TODO Phase 5/6: wire to ChatInterface in extra-credit mode after the round
    alert("Extra Credit wiring is coming next — for now, click Done.");
  }, []);

  if (pageState.kind === "loading" || !concept) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  const BackBar = (
    <div className="px-4 pt-3">
      <button
        onClick={navigateBack}
        className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
      >
        ← Back
      </button>
    </div>
  );

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

  if (pageState.kind === "needs_reimport") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="space-y-3 max-w-md">
            <div className="text-[var(--neon-magenta)] font-[family-name:var(--font-share-tech-mono)]">
              {concept.title}
            </div>
            <div className="text-[var(--foreground)]/70 text-sm">
              This concept has no facets defined yet. The curriculum needs to be regenerated with the updated generator prompt and re-imported via the Import page.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.kind === "mastered") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="space-y-3">
            <div className="text-5xl text-[var(--neon-green)]">✓</div>
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] tracking-widest text-sm">
              MASTERED
            </div>
            <div className="text-[var(--foreground)]/70">{concept.title}</div>
            <div className="text-xs text-[var(--foreground)]/40">No further rounds.</div>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.kind === "no_rounds_due") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div className="space-y-3">
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)]">
              {concept.title}
            </div>
            <div className="text-[var(--foreground)]/60 text-sm">
              No facets are due for review right now. Come back later.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pageState.kind === "lesson_gate") {
    return (
      <div className="flex-1 flex flex-col w-full">
        {BackBar}
        <LessonGate
          conceptTitle={concept.title}
          lessonMarkdown={concept.lessonMarkdown}
          onStart={handleStartFromGate}
        />
      </div>
    );
  }

  if (pageState.kind === "round") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex flex-col min-h-0">
          <RoundView
            conceptId={conceptId}
            conceptTitle={concept.title}
            facetName={pageState.facet.name}
            currentLevel={pageState.facet.level}
            currentExpertStage={pageState.facet.expertStage}
            onResolve={handleRoundResolve}
          />
        </div>
      </div>
    );
  }

  if (pageState.kind === "result") {
    // Other facets that were due before this round (excluding the one we just finished).
    // Approximation — we haven't re-fetched yet — but good enough to decide whether to
    // offer the "Next round" button.
    const facets = resolveFacets(concept, new Date());
    const otherDue = facets.filter(
      (f) => f.due && f.name !== pageState.previousFacet.name
    );
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <RoundResultView
          result={pageState.result}
          previousLevel={pageState.previousFacet.level}
          previousExpertStage={pageState.previousFacet.expertStage}
          hasMoreRoundsDue={otherDue.length > 0}
          onNextRound={handleNextRound}
          onExtraCredit={handleExtraCredit}
          onDone={navigateBack}
        />
      </div>
    );
  }

  return null;
}
