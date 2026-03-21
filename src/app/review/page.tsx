"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";
import { ReviewQueueItem } from "@/lib/types";
import Link from "next/link";

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-[var(--text-secondary)]">Loading review queue...</div>}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const subject = searchParams.get("subject");
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    const url = subject ? `/api/review?subject=${subject}` : "/api/review";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setQueue(data.queue);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [subject]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= queue.length) {
      setSessionComplete(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, queue.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            All caught up!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            No concepts due for review right now.
          </p>
          <Link
            href={subject ? `/subject/${subject}` : "/dashboard"}
            className="btn-neon-green px-6 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-block"
          >
            {subject ? "Back to Subject" : "Back to Dashboard"}
          </Link>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            Review complete!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            You reviewed {queue.length} concept
            {queue.length !== 1 ? "s" : ""}. Nice work.
          </p>
          <Link
            href={subject ? `/subject/${subject}` : "/dashboard"}
            className="btn-neon-green px-6 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-block"
          >
            {subject ? "Back to Subject" : "Back to Dashboard"}
          </Link>
        </div>
      </div>
    );
  }

  const current = queue[currentIndex];

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      {/* Progress bar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-retro)] px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[var(--foreground)] opacity-40 text-xs font-[family-name:var(--font-share-tech-mono)]">
            {current.curriculumName} &rsaquo; {current.sectionName}
          </span>
          <span className="text-[var(--neon-magenta)] text-xs font-[family-name:var(--font-share-tech-mono)]">
            {currentIndex + 1} of {queue.length}
          </span>
        </div>
        <div className="h-1 bg-[var(--surface-light)] rounded-full overflow-hidden">
          <div
            className="h-full progress-glow-cyan transition-all"
            style={{
              width: `${((currentIndex + 1) / queue.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <ChatInterface
        key={current.conceptId}
        conceptId={current.conceptId}
        conceptTitle={current.conceptTitle}
        mode="REVIEW"
        onMasteryUpdate={() => {
          // Small delay so the user can read the feedback
          setTimeout(handleNext, 3000);
        }}
      />
    </div>
  );
}
