"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { FacetLevel } from "@prisma/client";
import LessonGate from "@/components/LessonGate";
import RoundView from "@/components/RoundView";
import RoundResultView from "@/components/RoundResultView";
import SynthesisView from "@/components/SynthesisView";
import SynthesisResultView from "@/components/SynthesisResultView";
import ChatInterface from "@/components/ChatInterface";
import RoundHistoryViewer from "@/components/RoundHistoryViewer";
import { isSynthesisReady } from "@/lib/levels";
import type { RoundResult } from "@/hooks/useRound";
import type { SynthesisResult } from "@/hooks/useSynthesis";

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

function formatCooldownDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "needs_reimport" }
  | { kind: "mastered" }
  | { kind: "no_rounds_due" }
  | { kind: "synthesis_gate"; hasRoundsDue: boolean }
  | { kind: "synthesis_cooldown"; cooldownUntil: Date }
  | { kind: "synthesis_in_progress" }
  | { kind: "synthesis_result"; result: SynthesisResult }
  | { kind: "lesson_gate" }
  | { kind: "round"; facet: ResolvedFacet }
  | { kind: "result"; result: RoundResult; previousFacet: ResolvedFacet }
  | { kind: "extra_credit"; previousFacetName: string };

export default function LearnPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params.conceptId as string;
  const [concept, setConcept] = useState<ConceptResponse | null>(null);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  // Fetch concept + mastery state. Re-runs after a round resolves.
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

        const now = new Date();
        const facets = resolveFacets(data, now);
        const allFacetsAtExpert3 =
          facets.length > 0 &&
          facets.every((f) =>
            isSynthesisReady({ level: f.level, expertStage: f.expertStage })
          );
        const cooldownUntil = data.mastery?.synthesisCooldownUntil
          ? new Date(data.mastery.synthesisCooldownUntil)
          : null;
        const cooldownActive = cooldownUntil != null && cooldownUntil > now;

        // Synthesis-ready takes precedence over individual rounds — user explicitly
        // opts in; the gate also tells them rounds are still available if they want.
        if (allFacetsAtExpert3 && !cooldownActive) {
          const hasRoundsDue = facets.some((f) => f.due);
          setPageState({ kind: "synthesis_gate", hasRoundsDue });
          return;
        }
        if (allFacetsAtExpert3 && cooldownActive && cooldownUntil) {
          setPageState({ kind: "synthesis_cooldown", cooldownUntil });
          return;
        }

        const hasAnyMastery = (data.mastery?.subMasteries.length ?? 0) > 0;
        if (!hasAnyMastery) {
          setPageState({ kind: "lesson_gate" });
          return;
        }

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
    setPageState({ kind: "loading" });
    setRefreshTick((t) => t + 1);
  }, []);

  const handleExtraCredit = useCallback(() => {
    setPageState((prev) => {
      if (prev.kind !== "result") return prev;
      return { kind: "extra_credit", previousFacetName: prev.previousFacet.name };
    });
  }, []);

  const handleStartSynthesis = useCallback(() => {
    setPageState({ kind: "synthesis_in_progress" });
  }, []);

  const handleSkipSynthesisDoRound = useCallback(() => {
    if (!concept) return;
    const facets = resolveFacets(concept, new Date());
    const weakest = pickWeakestOverdue(facets);
    if (!weakest) {
      setPageState({ kind: "no_rounds_due" });
      return;
    }
    setPageState({ kind: "round", facet: weakest });
  }, [concept]);

  // User chose a different due facet from the picker. Replace the current
  // round's facet — the key on RoundView forces a fresh useRound instance,
  // so the in-flight session for the original facet is just orphaned.
  const handleSwitchFacet = useCallback(
    (facetName: string) => {
      if (!concept) return;
      const facets = resolveFacets(concept, new Date());
      const picked = facets.find((f) => f.name === facetName);
      if (!picked) return;
      setPageState({ kind: "round", facet: picked });
    },
    [concept]
  );

  const handleSynthesisResolve = useCallback((result: SynthesisResult) => {
    setPageState({ kind: "synthesis_result", result });
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
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
          <div className="space-y-3">
            <div className="text-5xl text-[var(--neon-green)]">✓</div>
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] tracking-widest text-sm">
              MASTERED
            </div>
            <div className="text-[var(--foreground)]/70">{concept.title}</div>
            <div className="text-xs text-[var(--foreground)]/40">No further rounds.</div>
          </div>
        </div>
        <RoundHistoryViewer conceptId={conceptId} />
      </div>
    );
  }

  if (pageState.kind === "no_rounds_due") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
          <div className="space-y-3">
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)]">
              {concept.title}
            </div>
            <div className="text-[var(--foreground)]/60 text-sm">
              No facets are due for review right now. Come back later.
            </div>
          </div>
        </div>
        <RoundHistoryViewer conceptId={conceptId} />
      </div>
    );
  }

  if (pageState.kind === "synthesis_gate") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex items-center justify-center px-6 py-12">
          <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--neon-magenta)]/40 rounded-lg p-6 space-y-5 text-center">
            <div className="text-xs text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)] tracking-[0.4em]">
              ⚛ READY FOR SYNTHESIS
            </div>
            <div className="text-2xl text-[var(--neon-magenta)] font-[family-name:var(--font-share-tech-mono)] glow-magenta">
              {concept.title}
            </div>
            <div className="text-sm text-[var(--foreground)]/70 leading-relaxed">
              You've held every facet at Expert across the staircase. The synthesis round is the capstone — a single integration test that, on pass, masters the concept and burns it from your queue.
            </div>
            <div className="text-xs text-[var(--foreground)]/40">
              On fail: no facets drop, but a 1-week cooldown before retry.
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={handleStartSynthesis}
                className="w-full px-4 py-3 bg-[var(--neon-magenta)]/10 border border-[var(--neon-magenta)]/40 text-[var(--neon-magenta)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-magenta)]/20 hover:border-[var(--neon-magenta)]/60 transition-all duration-200"
              >
                Take the Mastery Test ▶
              </button>
              {pageState.hasRoundsDue && (
                <button
                  onClick={handleSkipSynthesisDoRound}
                  className="w-full px-4 py-2 text-[var(--foreground)]/60 hover:text-[var(--foreground)]/80 font-[family-name:var(--font-share-tech-mono)] text-xs transition-colors"
                >
                  Continue practicing rounds instead
                </button>
              )}
            </div>
          </div>
        </div>
        <RoundHistoryViewer conceptId={conceptId} />
      </div>
    );
  }

  if (pageState.kind === "synthesis_cooldown") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
          <div className="space-y-3 max-w-md">
            <div className="text-xs text-[var(--neon-magenta)]/70 font-[family-name:var(--font-share-tech-mono)] tracking-widest">
              SYNTHESIS COOLDOWN
            </div>
            <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)]">
              {concept.title}
            </div>
            <div className="text-sm text-[var(--foreground)]/70">
              Synthesis can be retried on{" "}
              <span className="text-[var(--neon-magenta)]">
                {formatCooldownDate(pageState.cooldownUntil)}
              </span>
              .
            </div>
            <div className="text-xs text-[var(--foreground)]/40">
              Use the time to revisit the lesson — the connections settle better with a gap.
            </div>
          </div>
        </div>
        <RoundHistoryViewer conceptId={conceptId} />
      </div>
    );
  }

  if (pageState.kind === "synthesis_in_progress") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex flex-col min-h-0">
          <SynthesisView
            conceptId={conceptId}
            conceptTitle={concept.title}
            facetNames={concept.facets}
            onResolve={handleSynthesisResolve}
          />
        </div>
      </div>
    );
  }

  if (pageState.kind === "synthesis_result") {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <SynthesisResultView
          result={pageState.result}
          conceptTitle={concept.title}
          onDone={navigateBack}
        />
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
    const allFacets = resolveFacets(concept, new Date());
    const alternativeFacets = allFacets
      .filter((f) => f.due && f.name !== pageState.facet.name)
      .map((f) => ({ name: f.name, level: f.level, expertStage: f.expertStage }));
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="flex-1 flex flex-col min-h-0">
          <RoundView
            key={pageState.facet.name}
            conceptId={conceptId}
            conceptTitle={concept.title}
            facetName={pageState.facet.name}
            currentLevel={pageState.facet.level}
            currentExpertStage={pageState.facet.expertStage}
            alternativeFacets={alternativeFacets}
            onSwitchFacet={handleSwitchFacet}
            onResolve={handleRoundResolve}
          />
        </div>
      </div>
    );
  }

  if (pageState.kind === "result") {
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

  if (pageState.kind === "extra_credit") {
    // Extra Credit is the only thing /api/chat still serves — open conversation,
    // no scoring, no assessment trigger. User exits via the BackBar above.
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {BackBar}
        <div className="px-4 pt-2 pb-1 text-xs text-[var(--neon-magenta)]/70 font-[family-name:var(--font-share-tech-mono)] tracking-wider">
          ◆ EXTRA CREDIT · {pageState.previousFacetName}
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <ChatInterface
            conceptId={conceptId}
            conceptTitle={concept.title}
            lessonMarkdown={concept.lessonMarkdown}
          />
        </div>
      </div>
    );
  }

  return null;
}
