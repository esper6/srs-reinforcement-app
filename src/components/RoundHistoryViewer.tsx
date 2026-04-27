"use client";

import { useEffect, useState } from "react";

interface HistoryMessage {
  role: string;
  content: string;
  createdAt: string;
}

interface HistorySession {
  id: string;
  mode: "ROUND" | "SYNTHESIS";
  startedAt: string;
  finishedAt: string;
  outcome: string;
  facetName: string | null;
  messages: HistoryMessage[];
}

interface RoundHistoryViewerProps {
  conceptId: string;
}

function formatRelative(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  if (ms < HOUR) return "just now";
  if (ms < DAY) {
    const h = Math.round(ms / HOUR);
    return `${h}h ago`;
  }
  if (ms < WEEK) {
    const d = Math.round(ms / DAY);
    return `${d}d ago`;
  }
  if (ms < 30 * DAY) {
    const w = Math.round(ms / WEEK);
    return `${w}w ago`;
  }
  const mo = Math.round(ms / (30 * DAY));
  return `${mo}mo ago`;
}

const START_TRIGGER = "[START ROUND]";

export default function RoundHistoryViewer({ conceptId }: RoundHistoryViewerProps) {
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/concept/${conceptId}/history`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if ("sessions" in data) setSessions(data.sessions);
      })
      .catch(() => {
        // Silent failure — history is a nice-to-have, not load-bearing.
      });
    return () => {
      cancelled = true;
    };
  }, [conceptId]);

  if (!sessions || sessions.length === 0) return null;

  const now = new Date();

  return (
    <div className="px-4 pb-8 max-w-3xl mx-auto w-full">
      <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--foreground)]/50 uppercase tracking-wider mb-3">
        Recent Rounds
      </h2>
      <div className="space-y-2">
        {sessions.map((s) => {
          const isOpen = expandedId === s.id;
          const isSynthesis = s.mode === "SYNTHESIS";
          const isAdvance = s.outcome === "advance" || s.outcome === "pass";
          const outcomeColor = isAdvance
            ? "text-[var(--neon-green)]"
            : "text-[var(--neon-magenta)]";
          const outcomeSymbol = isAdvance ? "✓" : "↓";

          return (
            <div
              key={s.id}
              className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : s.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-light)]/40 transition-all text-left"
              >
                <span className={`text-lg shrink-0 ${outcomeColor}`}>
                  {outcomeSymbol}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--foreground)]/80 font-[family-name:var(--font-share-tech-mono)]">
                  {isSynthesis ? "Synthesis" : (s.facetName ?? "Round")}
                </span>
                {isSynthesis && (
                  <span className="shrink-0 text-[10px] text-[var(--neon-magenta)]/70 font-[family-name:var(--font-share-tech-mono)] tracking-wider uppercase">
                    Synthesis
                  </span>
                )}
                <span className="shrink-0 text-xs text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)]">
                  {formatRelative(new Date(s.finishedAt), now)}
                </span>
                <span className="shrink-0 text-xs text-[var(--foreground)]/30 font-[family-name:var(--font-share-tech-mono)]">
                  {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border-retro)] px-4 py-3 space-y-3 bg-[var(--surface-light)]/30 max-h-96 overflow-y-auto">
                  {s.messages
                    .filter(
                      (m) =>
                        !(
                          m.role === "user" &&
                          m.content.startsWith(START_TRIGGER)
                        )
                    )
                    .filter((m) => m.content.length > 0)
                    .map((m, i) => (
                      <div key={i} className="text-sm">
                        <div
                          className={`text-[10px] uppercase tracking-wider mb-1 font-[family-name:var(--font-share-tech-mono)] ${
                            m.role === "user"
                              ? "text-[var(--neon-cyan)]/70"
                              : "text-[var(--foreground)]/40"
                          }`}
                        >
                          {m.role === "user" ? "you" : "tutor"}
                        </div>
                        <div className="text-[var(--foreground)]/80 whitespace-pre-wrap leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
