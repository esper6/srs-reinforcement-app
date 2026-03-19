"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatInterface from "@/components/ChatInterface";
import MasteryGraph from "@/components/MasteryGraph";
import Link from "next/link";

interface QueueItem {
  conceptId: string;
  conceptTitle: string;
  sectionName: string;
  curriculumName: string;
}

export default function AssessQueuePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [graphItems, setGraphItems] = useState<{ conceptId: string; title: string; score: number; isNew: boolean }[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/assess-queue?subject=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setQueue(data.queue);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

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
            All assessed!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            Every concept in this subject has been assessed. Check your reviews.
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

  if (sessionComplete) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-[family-name:var(--font-share-tech-mono)] text-2xl text-[var(--neon-green)] font-bold mb-2 glow-green">
            Session complete!
          </p>
          <p className="text-[var(--foreground)] opacity-50 mb-6">
            You assessed {currentIndex + 1} concept
            {currentIndex > 0 ? "s" : ""}. Nice work.
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

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      {/* Progress bar */}
      <div className="bg-[var(--surface)] border-b border-[var(--border-retro)] px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[var(--foreground)] opacity-40 text-xs font-[family-name:var(--font-share-tech-mono)]">
            {current.curriculumName} &rsaquo; {current.sectionName}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[var(--neon-cyan)] text-xs font-[family-name:var(--font-share-tech-mono)]">
              {currentIndex + 1} of {queue.length}
            </span>
            <button
              onClick={() => router.push(`/subject/${slug}`)}
              className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-magenta)] text-xs font-[family-name:var(--font-share-tech-mono)] transition-colors"
            >
              Exit
            </button>
          </div>
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

      {showGraph && (
        <div className="border-b border-[var(--border-retro)] px-4 py-4 bg-[var(--surface)]">
          <h3 className="text-[var(--neon-green)] text-sm font-[family-name:var(--font-share-tech-mono)] glow-green mb-3">
            Mastery updated: {lastScore}%
          </h3>
          <MasteryGraph
            items={graphItems}
            highlightId={current.conceptId}
          />
        </div>
      )}

      <ChatInterface
        key={current.conceptId}
        conceptId={current.conceptId}
        conceptTitle={current.conceptTitle}
        mode="ASSESS"
        onMasteryUpdate={(score) => {
          setLastScore(score);
          setShowGraph(false);
          // Fetch subject masteries for graph
          fetch(`/api/subject-masteries?subject=${slug}`)
            .then((r) => r.json())
            .then((data) => {
              const masteries = data.masteries as { conceptId: string; title: string; score: number }[];
              const existing = masteries.find((m) => m.conceptId === current.conceptId);
              if (existing) {
                existing.score = score;
              } else {
                masteries.push({ conceptId: current.conceptId, title: current.conceptTitle, score });
              }
              setGraphItems(masteries.map((m) => ({ ...m, isNew: m.conceptId === current.conceptId })));
              setShowGraph(true);
            })
            .catch(() => {});
          setTimeout(handleNext, 5000);
        }}
      />
    </div>
  );
}
