"use client";

import { SYNTHESIS_COOLDOWN_MS } from "@/lib/levels";
import type { SynthesisResult } from "@/hooks/useSynthesis";

interface SynthesisResultViewProps {
  result: SynthesisResult;
  conceptTitle: string;
  onDone: () => void;
}

function formatRetryDate(retryAt: Date): string {
  // Concise local date — "Tue May 5" / "May 5"
  return retryAt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function SynthesisResultView({
  result,
  conceptTitle,
  onDone,
}: SynthesisResultViewProps) {
  if (result.outcome === "pass") {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl text-[var(--neon-green)] glow-green animate-pulse">✓</div>
          <div className="space-y-2">
            <div className="text-xs text-[var(--neon-green)]/80 font-[family-name:var(--font-share-tech-mono)] tracking-[0.4em]">
              MASTERED
            </div>
            <div className="text-2xl text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] glow-cyan">
              {conceptTitle}
            </div>
            <div className="text-sm text-[var(--foreground)]/60 mt-3 leading-relaxed">
              You held every facet at Expert and integrated them under pressure.
              This concept is burned — no further reviews.
            </div>
          </div>
          <button
            onClick={onDone}
            className="mt-6 px-6 py-3 bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/40 text-[var(--neon-green)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-green)]/20 transition-all duration-200"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // fail — cooldown
  const retryAt = new Date(Date.now() + SYNTHESIS_COOLDOWN_MS);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-5xl text-[var(--neon-magenta)]">○</div>
        <div className="space-y-2">
          <div className="text-xs text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)] tracking-[0.4em]">
            NOT YET
          </div>
          <div className="text-xl text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)]">
            {conceptTitle}
          </div>
          <div className="text-sm text-[var(--foreground)]/70 mt-3 leading-relaxed">
            The synthesis didn't quite hold together. No facets dropped — your
            individual mastery is intact. Come back to try again on{" "}
            <span className="text-[var(--neon-magenta)]">{formatRetryDate(retryAt)}</span>.
          </div>
          <div className="text-xs text-[var(--foreground)]/40 mt-2">
            Use the week to revisit the lesson and let the connections settle.
          </div>
        </div>
        <button
          onClick={onDone}
          className="mt-6 px-6 py-3 bg-[var(--surface-light)] border border-[var(--border-retro)] text-[var(--foreground)]/80 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--surface-light)]/80 transition-all duration-200"
        >
          Done for now
        </button>
      </div>
    </div>
  );
}
