"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface VocabItem {
  vocabWordId: string;
  term: string;
  definition: string;
  conceptTitle: string;
  stage: string;
  streak: number;
  isNew: boolean;
}

interface GradeResult {
  correct: boolean;
  feedback: string;
  definition: string;
  stage: string;
  streak: number;
}

const STAGE_COLORS: Record<string, string> = {
  Apprentice: "var(--neon-magenta)",
  Journeyman: "var(--neon-cyan)",
  Adept: "var(--neon-green)",
  Master: "var(--neon-purple)",
  Burned: "var(--extra-credit-accent)",
};

type Phase = "loading" | "answering" | "grading" | "feedback" | "complete";

export default function DrillPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [queue, setQueue] = useState<VocabItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    fetch(`/api/vocab/queue?subject=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setQueue(data.queue);
        setPhase(data.queue.length > 0 ? "answering" : "complete");
      })
      .catch(() => setPhase("complete"));
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || phase !== "answering") return;

    setPhase("grading");
    try {
      const res = await fetch("/api/vocab/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vocabWordId: queue[currentIndex].vocabWordId,
          answer: answer.trim(),
        }),
      });
      const data: GradeResult = await res.json();
      setResult(data);
      setStats((prev) => ({
        correct: prev.correct + (data.correct ? 1 : 0),
        wrong: prev.wrong + (data.correct ? 0 : 1),
      }));
      setPhase("feedback");
    } catch {
      setResult({
        correct: false,
        feedback: "Failed to grade. Try again.",
        definition: queue[currentIndex].definition,
        stage: "Apprentice",
        streak: 0,
      });
      setPhase("feedback");
    }
  }

  function handleNext() {
    if (currentIndex + 1 >= queue.length) {
      setPhase("complete");
    } else {
      setCurrentIndex((i) => i + 1);
      setAnswer("");
      setResult(null);
      setPhase("answering");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (phase === "feedback") {
        handleNext();
      } else if (phase === "answering") {
        handleSubmit(e);
      }
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "complete" && queue.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            No vocab to drill!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            This subject doesn&apos;t have vocab words yet, or all are burned.
          </p>
          <Link
            href={`/subject/${slug}`}
            className="btn-neon-green px-6 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-block"
          >
            Back to Subject
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            Drill complete!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-1">
            {stats.correct + stats.wrong} words drilled
          </p>
          <p className="text-sm mb-6">
            <span className="text-[var(--neon-green)]">{stats.correct} correct</span>
            {" "}&middot;{" "}
            <span className="text-[var(--neon-magenta)]">{stats.wrong} wrong</span>
          </p>
          <Link
            href={`/subject/${slug}`}
            className="btn-neon-green px-6 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-block"
          >
            Back to Subject
          </Link>
        </div>
      </div>
    );
  }

  const current = queue[currentIndex];
  const stageColor = STAGE_COLORS[current.stage] ?? "var(--foreground)";

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4">
      {/* Progress bar */}
      <div className="py-3">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => router.push(`/subject/${slug}`)}
            className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
          >
            &larr; Exit
          </button>
          <span className="text-[var(--neon-cyan)] text-xs font-[family-name:var(--font-share-tech-mono)]">
            {currentIndex + 1} / {queue.length}
          </span>
        </div>
        <div className="h-1 bg-[var(--surface-light)] rounded-full overflow-hidden">
          <div
            className="h-full progress-glow-cyan transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col justify-center pb-8">
        <div
          className={`bg-[var(--surface)] border rounded-lg p-8 mb-4 transition-all duration-300 ${
            phase === "feedback" && result
              ? result.correct
                ? "border-[var(--neon-green)]/50 shadow-[0_0_20px_rgba(0,255,136,0.1)]"
                : "border-[var(--neon-magenta)]/50 shadow-[0_0_20px_rgba(255,0,170,0.1)]"
              : "border-[var(--border-retro)]"
          }`}
        >
          {/* Term header */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-[var(--foreground)]/30 text-xs font-[family-name:var(--font-share-tech-mono)]">
              {current.conceptTitle}
            </p>
            <span
              className="text-[10px] font-[family-name:var(--font-share-tech-mono)] px-2 py-0.5 rounded"
              style={{
                color: stageColor,
                background: `color-mix(in srgb, ${stageColor} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${stageColor} 30%, transparent)`,
              }}
            >
              {current.isNew ? "new" : current.stage}
            </span>
          </div>

          <h2 className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-cyan)] text-center mb-8 glow-cyan">
            {current.term}
          </h2>

          {/* Answer input or feedback */}
          {phase === "feedback" && result ? (
            <div>
              <div className="mb-4">
                <p
                  className="text-sm font-[family-name:var(--font-share-tech-mono)] mb-2"
                  style={{ color: result.correct ? "var(--neon-green)" : "var(--neon-magenta)" }}
                >
                  {result.correct ? "Correct!" : "Not quite."}
                </p>
                <p className="text-[var(--foreground)]/70 text-sm leading-relaxed">
                  {result.feedback}
                </p>
              </div>
              {!result.correct && (
                <div className="bg-[var(--background)] border border-[var(--border-retro)] rounded p-3 mb-4">
                  <p className="text-[var(--foreground)]/40 text-[10px] font-[family-name:var(--font-share-tech-mono)] uppercase tracking-wider mb-1">
                    Definition
                  </p>
                  <p className="text-[var(--foreground)]/80 text-sm">{result.definition}</p>
                </div>
              )}
              <button
                onClick={handleNext}
                className="w-full py-2.5 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm btn-neon transition-all duration-200"
              >
                {currentIndex + 1 >= queue.length ? "Finish" : "Next"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Define this term..."
                autoFocus
                disabled={phase === "grading"}
                className="w-full bg-[var(--background)] border border-[var(--border-retro)] rounded-lg px-4 py-3 text-sm text-[var(--foreground)] font-[family-name:var(--font-geist-mono)] placeholder:text-[var(--foreground)]/20 focus:outline-none focus:border-[var(--neon-cyan)]/40 mb-3 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!answer.trim() || phase === "grading"}
                className="w-full py-2.5 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm btn-neon disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                {phase === "grading" ? "Grading..." : "Submit"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
