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

const STAGE_LABELS: Record<string, string> = {
  Apprentice: "Apprentice",
  Journeyman: "Journeyman",
  Adept: "Adept",
  Master: "Master",
  Burned: "Burned",
};

type Phase = "loading" | "answering" | "grading" | "feedback" | "complete";

/* ── Win2K chrome helpers ──────────────────────────────────── */
function TitleBar({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="win2k-titlebar flex items-center justify-between px-2 py-1 select-none">
      <div className="flex items-center gap-1.5">
        {/* tiny app icon */}
        <div className="w-4 h-4 bg-[#ece9d8] border border-[#7b7b7b] flex items-center justify-center text-[8px] leading-none font-bold text-[#000080]">
          M
        </div>
        <span className="text-white text-xs font-bold">{title}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Win2KButton tiny label="─" />
        <Win2KButton tiny label="□" />
        <Win2KButton tiny label="✕" onClick={onClose} danger />
      </div>
    </div>
  );
}

function Win2KButton({
  label,
  onClick,
  disabled,
  tiny,
  danger,
  full,
  primary,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tiny?: boolean;
  danger?: boolean;
  full?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "win2k-btn",
        tiny ? "win2k-btn-tiny" : "win2k-btn-normal",
        danger ? "win2k-btn-danger" : "",
        primary ? "win2k-btn-primary" : "",
        full ? "w-full" : "",
        disabled ? "opacity-50 cursor-default" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

function GroupBox({ label, children }: { children: React.ReactNode; label: string }) {
  return (
    <div className="win2k-groupbox relative mt-3 pt-4 px-3 pb-3">
      <span className="win2k-groupbox-label absolute -top-2.5 left-2 bg-[var(--win-bg)] px-1 text-xs text-[var(--win-text)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function StatusBar({ left, right }: { left: string; right?: string }) {
  return (
    <div className="win2k-statusbar flex items-center justify-between px-2 py-0.5 text-[11px] text-[var(--win-text)]">
      <div className="win2k-status-pane flex-1 mr-1">{left}</div>
      {right && <div className="win2k-status-pane px-2">{right}</div>}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
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
      if (phase === "feedback") handleNext();
      else if (phase === "answering") handleSubmit(e as unknown as React.FormEvent);
    }
  }

  /* ── Loading ── */
  if (phase === "loading") {
    return (
      <div className="win2k-desktop flex-1 flex items-center justify-center p-6">
        <div className="win2k-window w-72">
          <TitleBar title="MEMORY.dump — Loading..." />
          <div className="win2k-window-body p-6 flex flex-col items-center gap-3">
            <div className="win2k-progress-bar w-full">
              <div className="win2k-progress-fill animate-[w2k-marching_1.2s_linear_infinite]" />
            </div>
            <p className="text-xs text-[var(--win-text)]">Loading vocabulary queue...</p>
          </div>
          <StatusBar left="Please wait" />
        </div>
      </div>
    );
  }

  /* ── Empty queue ── */
  if (phase === "complete" && queue.length === 0) {
    return (
      <div className="win2k-desktop flex-1 flex items-center justify-center p-6">
        <div className="win2k-window w-80">
          <TitleBar title="Information" onClose={() => router.push(`/subject/${slug}`)} />
          <div className="win2k-window-body p-5 flex gap-4 items-start">
            <div className="win2k-info-icon flex-shrink-0">ℹ</div>
            <div>
              <p className="text-sm font-bold text-[var(--win-text)] mb-1">No vocabulary to drill!</p>
              <p className="text-xs text-[var(--win-text)] leading-relaxed">
                This subject doesn&apos;t have vocab words yet, or all words have been burned.
              </p>
            </div>
          </div>
          <div className="win2k-window-body border-t border-[var(--win-border-dark)] px-4 py-3 flex justify-center gap-2">
            <Link href={`/subject/${slug}`}>
              <Win2KButton label="OK" primary />
            </Link>
          </div>
          <StatusBar left="Ready" />
        </div>
      </div>
    );
  }

  /* ── Complete ── */
  if (phase === "complete") {
    const total = stats.correct + stats.wrong;
    const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
    return (
      <div className="win2k-desktop flex-1 flex items-center justify-center p-6">
        <div className="win2k-window w-96">
          <TitleBar title="Drill Complete — MEMORY.dump" onClose={() => router.push(`/subject/${slug}`)} />
          <div className="win2k-window-body p-5">
            <div className="flex gap-4 items-start mb-4">
              <div className="win2k-check-icon flex-shrink-0">✓</div>
              <div>
                <p className="text-sm font-bold text-[var(--win-text)] mb-1">Drill session finished!</p>
                <p className="text-xs text-[var(--win-text)]">{total} words drilled in this session.</p>
              </div>
            </div>

            <GroupBox label="Session Results">
              <table className="w-full text-xs text-[var(--win-text)] border-collapse">
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-4">Words drilled:</td>
                    <td className="py-0.5 font-bold">{total}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4">Correct:</td>
                    <td className="py-0.5 font-bold text-[#008000]">{stats.correct}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4">Incorrect:</td>
                    <td className="py-0.5 font-bold text-[#c00000]">{stats.wrong}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4">Score:</td>
                    <td className="py-0.5 font-bold">{pct}%</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-2">
                <div className="win2k-progress-track h-4 relative">
                  <div
                    className="win2k-progress-fill-solid h-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </GroupBox>
          </div>
          <div className="win2k-window-body border-t border-[var(--win-border-dark)] px-4 py-3 flex justify-end gap-2">
            <Link href={`/subject/${slug}`}>
              <Win2KButton label="Back to Subject" primary />
            </Link>
            <Win2KButton label="Close" onClick={() => router.push("/dashboard")} />
          </div>
          <StatusBar left="Session complete" right={`Score: ${pct}%`} />
        </div>
      </div>
    );
  }

  /* ── Main drill ── */
  const current = queue[currentIndex];
  const progressPct = ((currentIndex + 1) / queue.length) * 100;
  const stageLabel = STAGE_LABELS[current.stage] ?? current.stage;

  return (
    <div className="win2k-desktop flex-1 flex items-start justify-center p-4 pt-6">
      <div className="win2k-window w-full max-w-xl">
        {/* Title bar */}
        <TitleBar
          title={`MEMORY.dump — Vocabulary Drill [${slug}]`}
          onClose={() => router.push(`/subject/${slug}`)}
        />

        {/* Menu bar */}
        <div className="win2k-menubar flex items-center px-1 text-xs text-[var(--win-text)] gap-0 border-b border-[var(--win-border-dark)]">
          {["File", "View", "Help"].map((m) => (
            <button key={m} className="win2k-menubar-item px-2 py-0.5 hover:bg-[#000080] hover:text-white">
              <span className="underline">{m[0]}</span>
              {m.slice(1)}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="win2k-toolbar flex items-center gap-1 px-2 py-1 border-b border-[var(--win-border-dark)]">
          <Win2KButton tiny label="◀ Exit" onClick={() => router.push(`/subject/${slug}`)} />
          <div className="win2k-toolbar-sep mx-1" />
          <span className="text-[11px] text-[var(--win-text)] ml-1">
            Card {currentIndex + 1} of {queue.length}
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-[var(--win-text-muted)] bg-[var(--win-inset)] border border-[var(--win-border-dark)] px-2 py-0.5">
            {current.isNew ? "NEW" : stageLabel}
          </span>
        </div>

        {/* Window body */}
        <div className="win2k-window-body p-4 space-y-3">
          {/* Progress */}
          <GroupBox label="Progress">
            <div className="flex items-center gap-2">
              <div className="win2k-progress-track h-4 flex-1 relative">
                <div
                  className="win2k-progress-fill-solid h-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[11px] text-[var(--win-text)] w-12 text-right tabular-nums">
                {Math.round(progressPct)}%
              </span>
            </div>
          </GroupBox>

          {/* Card area */}
          <GroupBox label={`Concept: ${current.conceptTitle}`}>
            {/* Term */}
            <div className="win2k-term-display win2k-inset px-3 py-4 text-center mb-3">
              <p className="text-[11px] text-[var(--win-text-muted)] mb-1 uppercase tracking-wide">Term</p>
              <p className="text-xl font-bold text-[#000080]">{current.term}</p>
            </div>

            {/* New word: show definition */}
            {current.isNew && phase === "answering" && (
              <div className="space-y-3">
                <div className="win2k-inset px-3 py-2">
                  <p className="text-[11px] text-[var(--win-text-muted)] uppercase tracking-wide mb-1">
                    Definition
                  </p>
                  <p className="text-xs text-[var(--win-text)] leading-relaxed">
                    {current.definition}
                  </p>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Win2KButton label="Got it →" onClick={handleNext} primary />
                </div>
              </div>
            )}

            {/* Feedback state */}
            {phase === "feedback" && result && (
              <div className="space-y-3">
                <div
                  className={`win2k-feedback-box px-3 py-2 ${
                    result.correct ? "win2k-feedback-correct" : "win2k-feedback-wrong"
                  }`}
                >
                  <p className="text-xs font-bold mb-1">
                    {result.correct ? "✓ Correct!" : "✗ Incorrect"}
                  </p>
                  <p className="text-xs leading-relaxed">{result.feedback}</p>
                </div>

                {!result.correct && (
                  <div className="win2k-inset px-3 py-2">
                    <p className="text-[11px] text-[var(--win-text-muted)] uppercase tracking-wide mb-1">
                      Correct Definition
                    </p>
                    <p className="text-xs text-[var(--win-text)] leading-relaxed">
                      {result.definition}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Win2KButton
                    label={currentIndex + 1 >= queue.length ? "Finish ✓" : "Next →"}
                    onClick={handleNext}
                    primary
                  />
                </div>
              </div>
            )}

            {/* Answering state */}
            {(phase === "answering" || phase === "grading") && !current.isNew && (
              <form onSubmit={handleSubmit} className="space-y-2">
                <label className="block text-[11px] text-[var(--win-text)] mb-0.5">
                  Your definition:
                </label>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer here..."
                  autoFocus
                  disabled={phase === "grading"}
                  className="win2k-input w-full"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Win2KButton
                    label={phase === "grading" ? "Grading..." : "Submit"}
                    disabled={!answer.trim() || phase === "grading"}
                    primary
                    onClick={() => {}}
                  />
                  <Win2KButton
                    label="Skip"
                    disabled={phase === "grading"}
                    onClick={handleNext}
                  />
                </div>
              </form>
            )}
          </GroupBox>

          {/* Stats row */}
          <div className="flex gap-2">
            <div className="win2k-inset flex-1 px-2 py-1 text-center">
              <p className="text-[10px] text-[var(--win-text-muted)] uppercase">Correct</p>
              <p className="text-sm font-bold text-[#008000]">{stats.correct}</p>
            </div>
            <div className="win2k-inset flex-1 px-2 py-1 text-center">
              <p className="text-[10px] text-[var(--win-text-muted)] uppercase">Incorrect</p>
              <p className="text-sm font-bold text-[#c00000]">{stats.wrong}</p>
            </div>
            <div className="win2k-inset flex-1 px-2 py-1 text-center">
              <p className="text-[10px] text-[var(--win-text-muted)] uppercase">Remaining</p>
              <p className="text-sm font-bold text-[var(--win-text)]">
                {queue.length - currentIndex - 1}
              </p>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <StatusBar
          left={phase === "grading" ? "Grading answer..." : "Ready"}
          right={`${currentIndex + 1}/${queue.length} cards`}
        />
      </div>
    </div>
  );
}
