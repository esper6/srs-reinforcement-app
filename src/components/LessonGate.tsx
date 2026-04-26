"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LessonGateProps {
  conceptTitle: string;
  lessonMarkdown: string;
  onStart: () => void;
}

// Shown before the first round on a concept the user has never touched.
// Implements the "first encounter shows lesson, then test" pattern from
// docs/rounds-redesign.md. After the first round, the lesson is only
// available via Extra Credit or an explicit standalone "Read" affordance —
// it's never shown right before a round.
export default function LessonGate({
  conceptTitle,
  lessonMarkdown,
  onStart,
}: LessonGateProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <div className="text-xs text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)] tracking-widest mb-2">
        📖 LESSON · FIRST ENCOUNTER
      </div>
      <h1 className="text-2xl text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] glow-cyan mb-3">
        {conceptTitle}
      </h1>
      <p className="text-sm text-[var(--foreground)]/60 mb-6">
        Read through once at your own pace. There's no time pressure here.
        When you start the first round, the lesson is hidden — you'll be tested on recall, not recognition.
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-6 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonMarkdown}</ReactMarkdown>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onStart}
          className="px-6 py-3 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded-lg font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all duration-200"
        >
          Start First Round →
        </button>
      </div>
    </div>
  );
}
