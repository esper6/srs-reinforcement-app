"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { STAGE_COLORS, type VocabStage } from "@/lib/vocab-srs";

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

// Shuffle array in place (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type DrillMode = "lessons" | "reviews";
type Phase = "loading" | "teaching" | "answering" | "grading" | "feedback" | "complete";

export default function DrillPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const mode: DrillMode = (searchParams.get("mode") as DrillMode) ?? "reviews";

  // Lesson state
  const [lessonBatch, setLessonBatch] = useState<VocabItem[]>([]);
  const [teachIndex, setTeachIndex] = useState(0);
  const [quizQueue, setQuizQueue] = useState<VocabItem[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set());

  // Review state
  const [reviewQueue, setReviewQueue] = useState<VocabItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  // Shared state
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });
  const [dismissing, setDismissing] = useState(false);
  const [totalNew, setTotalNew] = useState(0);

  const fetchQueue = useCallback(() => {
    setPhase("loading");
    setStats({ correct: 0, wrong: 0 });
    setLearnedIds(new Set());
    setAnswer("");
    setResult(null);
    fetch(`/api/vocab/queue?subject=${slug}&mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.queue.length === 0) {
          setPhase("complete");
          return;
        }
        if (mode === "lessons") {
          setLessonBatch(data.queue);
          setTotalNew(data.totalNew ?? data.queue.length);
          setTeachIndex(0);
          setPhase("teaching");
        } else {
          setReviewQueue(data.queue);
          setReviewIndex(0);
          setPhase("answering");
        }
      })
      .catch(() => setPhase("complete"));
  }, [slug, mode]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Current word depends on mode and phase
  const getCurrentWord = useCallback((): VocabItem | null => {
    if (mode === "lessons") {
      if (phase === "teaching") return lessonBatch[teachIndex] ?? null;
      return quizQueue[quizIndex] ?? null;
    }
    return reviewQueue[reviewIndex] ?? null;
  }, [mode, phase, lessonBatch, teachIndex, quizQueue, quizIndex, reviewQueue, reviewIndex]);

  // Teaching: advance through definitions
  function handleTeachNext() {
    if (teachIndex + 1 < lessonBatch.length) {
      setTeachIndex((i) => i + 1);
    } else {
      // Done teaching — start quiz on these words (shuffled)
      setQuizQueue(shuffle(lessonBatch));
      setQuizIndex(0);
      setAnswer("");
      setPhase("answering");
    }
  }

  // Submit answer for grading
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const current = getCurrentWord();
    if (!answer.trim() || phase !== "answering" || !current) return;

    setPhase("grading");
    try {
      const res = await fetch("/api/vocab/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vocabWordId: current.vocabWordId,
          answer: answer.trim(),
          mode,
        }),
      });
      const data: GradeResult = await res.json();
      setResult(data);
      setStats((prev) => ({
        correct: prev.correct + (data.correct ? 1 : 0),
        wrong: prev.wrong + (data.correct ? 0 : 1),
      }));

      if (mode === "lessons" && data.correct) {
        setLearnedIds((prev) => new Set(prev).add(current.vocabWordId));
      }

      setPhase("feedback");
    } catch {
      setResult({
        correct: false,
        feedback: "Failed to grade. Try again.",
        definition: current.definition,
        stage: "Novice",
        streak: 0,
      });
      setPhase("feedback");
    }
  }

  // Advance to next word after feedback
  function handleNext() {
    setAnswer("");
    setResult(null);

    if (mode === "lessons") {
      const current = quizQueue[quizIndex];
      if (result?.correct) {
        // Word learned — remove from quiz queue
        const remaining = quizQueue.filter((_, i) => i !== quizIndex);
        if (remaining.length === 0) {
          // Batch complete!
          setPhase("complete");
          return;
        }
        setQuizQueue(remaining);
        setQuizIndex((i) => (i >= remaining.length ? 0 : i));
      } else {
        // Wrong — move to end of quiz queue so it comes back around
        const requeued = [...quizQueue.filter((_, i) => i !== quizIndex), current];
        setQuizQueue(requeued);
        setQuizIndex((i) => (i >= requeued.length - 1 ? 0 : i));
      }
      setPhase("answering");
    } else {
      // Reviews: straight sequential
      if (reviewIndex + 1 >= reviewQueue.length) {
        setPhase("complete");
      } else {
        setReviewIndex((i) => i + 1);
        setPhase("answering");
      }
    }
  }

  // Dismiss a word
  async function handleDismiss() {
    const current = getCurrentWord();
    if (dismissing || !current) return;
    setDismissing(true);
    try {
      await fetch("/api/vocab/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabWordId: current.vocabWordId }),
      });

      if (mode === "lessons") {
        if (phase === "teaching") {
          const newBatch = lessonBatch.filter((v) => v.vocabWordId !== current.vocabWordId);
          setLessonBatch(newBatch);
          if (newBatch.length === 0) {
            setPhase("complete");
          } else {
            setTeachIndex((i) => Math.min(i, newBatch.length - 1));
          }
        } else {
          const newQuiz = quizQueue.filter((v) => v.vocabWordId !== current.vocabWordId);
          setQuizQueue(newQuiz);
          if (newQuiz.length === 0) {
            setPhase("complete");
          } else {
            setQuizIndex((i) => Math.min(i, newQuiz.length - 1));
            setAnswer("");
            setResult(null);
            setPhase("answering");
          }
        }
      } else {
        const newQueue = reviewQueue.filter((_, i) => i !== reviewIndex);
        setReviewQueue(newQueue);
        if (newQueue.length === 0) {
          setPhase("complete");
        } else {
          setReviewIndex((i) => Math.min(i, newQueue.length - 1));
          setAnswer("");
          setResult(null);
          setPhase("answering");
        }
      }
    } finally {
      setDismissing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (phase === "feedback") handleNext();
      else if (phase === "answering") handleSubmit(e);
      else if (phase === "teaching") handleTeachNext();
    }
  }

  // --- Render ---

  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  const isLessonMode = mode === "lessons";
  const queueLength = isLessonMode
    ? (phase === "teaching" ? lessonBatch.length : quizQueue.length)
    : reviewQueue.length;

  if (phase === "complete" && queueLength === 0 && stats.correct === 0 && stats.wrong === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            {isLessonMode ? "No new vocab to learn!" : "No vocab reviews due!"}
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            {isLessonMode
              ? "All vocab words have been introduced. Check reviews!"
              : "Come back later when words are due for review."}
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
          {isLessonMode ? (
            <>
              <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
                Batch learned!
              </p>
              <p className="text-[var(--foreground)] opacity-50 mb-1">
                {learnedIds.size} word{learnedIds.size !== 1 ? "s" : ""} added to your review queue
              </p>
              <p className="text-sm mb-6">
                <span className="text-[var(--neon-green)]">{stats.correct} correct</span>
                {" "}&middot;{" "}
                <span className="text-[var(--neon-magenta)]">{stats.wrong} retries</span>
              </p>
              {totalNew > lessonBatch.length && (
                <button
                  onClick={fetchQueue}
                  className="btn-neon px-6 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-block mb-3"
                >
                  Next batch
                </button>
              )}
            </>
          ) : (
            <>
              <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
                Reviews complete!
              </p>
              <p className="text-[var(--foreground)] opacity-50 mb-1">
                {stats.correct + stats.wrong} words reviewed
              </p>
              <p className="text-sm mb-6">
                <span className="text-[var(--neon-green)]">{stats.correct} correct</span>
                {" "}&middot;{" "}
                <span className="text-[var(--neon-magenta)]">{stats.wrong} wrong</span>
              </p>
            </>
          )}
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

  const current = getCurrentWord();
  if (!current) return null;

  const stageColor = STAGE_COLORS[current.stage as VocabStage] ?? "var(--foreground)";

  // Progress calculation
  const progressNum = isLessonMode
    ? (phase === "teaching" ? teachIndex + 1 : learnedIds.size)
    : reviewIndex + 1;
  const progressDenom = isLessonMode ? lessonBatch.length : reviewQueue.length;
  const progressLabel = isLessonMode && phase !== "teaching"
    ? `${learnedIds.size}/${lessonBatch.length} learned`
    : `${progressNum} / ${progressDenom}`;
  const progressPct = (progressNum / progressDenom) * 100;

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
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-[family-name:var(--font-share-tech-mono)] px-2 py-0.5 rounded"
              style={{
                color: isLessonMode ? "var(--neon-cyan)" : "var(--neon-magenta)",
                background: isLessonMode
                  ? "color-mix(in srgb, var(--neon-cyan) 10%, transparent)"
                  : "color-mix(in srgb, var(--neon-magenta) 10%, transparent)",
                border: isLessonMode
                  ? "1px solid color-mix(in srgb, var(--neon-cyan) 30%, transparent)"
                  : "1px solid color-mix(in srgb, var(--neon-magenta) 30%, transparent)",
              }}
            >
              {isLessonMode
                ? (phase === "teaching" ? "learning" : "quiz")
                : "review"}
            </span>
            <span className="text-[var(--neon-cyan)] text-xs font-[family-name:var(--font-share-tech-mono)]">
              {progressLabel}
            </span>
          </div>
        </div>
        <div className="h-1 bg-[var(--surface-light)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isLessonMode ? "progress-glow-cyan" : "progress-glow-cyan"
            }`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
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
            <div className="flex items-center gap-2">
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
              <button
                onClick={handleDismiss}
                disabled={dismissing}
                title="Remove from drills"
                className="text-[var(--foreground)]/20 hover:text-[var(--neon-magenta)] transition-colors disabled:opacity-30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <h2 className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-cyan)] text-center mb-8 glow-cyan">
            {current.term}
          </h2>

          {/* Teaching phase: show definition */}
          {phase === "teaching" ? (
            <div>
              <div className="bg-[var(--background)] border border-[var(--neon-cyan)]/20 rounded-lg p-4 mb-6">
                <p className="text-[var(--foreground)]/40 text-[10px] font-[family-name:var(--font-share-tech-mono)] uppercase tracking-wider mb-2">
                  Definition
                </p>
                <p className="text-[var(--foreground)]/80 text-sm leading-relaxed">
                  {current.definition}
                </p>
              </div>
              <button
                onClick={handleTeachNext}
                onKeyDown={handleKeyDown}
                className="w-full py-2.5 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm btn-neon transition-all duration-200"
              >
                {teachIndex + 1 < lessonBatch.length ? "Next" : "Start Quiz"}
              </button>
            </div>
          ) : phase === "feedback" && result ? (
            /* Feedback phase */
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
                onKeyDown={handleKeyDown}
                className="w-full py-2.5 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm btn-neon transition-all duration-200"
              >
                {mode === "lessons" && result.correct && quizQueue.length <= 1
                  ? "Finish"
                  : mode === "reviews" && reviewIndex + 1 >= reviewQueue.length
                    ? "Finish"
                    : "Next"}
              </button>
            </div>
          ) : (
            /* Answering phase */
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
