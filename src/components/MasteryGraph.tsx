"use client";

import { useEffect, useState } from "react";

interface MasteryGraphItem {
  conceptId: string;
  title: string;
  score: number;
  isNew: boolean; // true if this was just assessed
}

interface MasteryGraphProps {
  items: MasteryGraphItem[];
  highlightId?: string; // the concept that was just assessed
}

export default function MasteryGraph({ items, highlightId }: MasteryGraphProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Trigger cascade animation after mount
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (items.length === 0) return null;

  // Sort: highlighted first, then by score descending
  const sorted = [...items].sort((a, b) => {
    if (a.conceptId === highlightId) return -1;
    if (b.conceptId === highlightId) return 1;
    return b.score - a.score;
  });

  return (
    <div className="space-y-2">
      {sorted.map((item, i) => {
        const isHighlight = item.conceptId === highlightId;
        const barColor = isHighlight
          ? "bg-[var(--neon-cyan)]"
          : item.score >= 70
            ? "bg-[var(--neon-green)]"
            : item.score >= 40
              ? "bg-yellow-400"
              : "bg-red-400";
        const glowClass = isHighlight
          ? "shadow-[0_0_12px_var(--neon-cyan)]"
          : "";
        const textColor = isHighlight
          ? "text-[var(--neon-cyan)]"
          : "text-[var(--foreground)] opacity-60";

        return (
          <div
            key={item.conceptId}
            className="flex items-center gap-3"
            style={{
              opacity: animated ? 1 : 0,
              transform: animated ? "translateX(0)" : "translateX(-20px)",
              transition: `all 0.5s ease-out ${i * 0.08}s`,
            }}
          >
            <span
              className={`text-xs font-[family-name:var(--font-share-tech-mono)] min-w-[140px] truncate text-right ${textColor}`}
            >
              {item.title}
            </span>
            <div className="flex-1 h-3 bg-[var(--surface-light)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} ${glowClass} transition-all duration-1000 ease-out`}
                style={{
                  width: animated ? `${Math.min(100, item.score)}%` : "0%",
                  transitionDelay: `${i * 0.08 + 0.2}s`,
                }}
              />
            </div>
            <span
              className={`text-xs font-[family-name:var(--font-share-tech-mono)] min-w-[2.5rem] ${textColor}`}
              style={{
                opacity: animated ? 1 : 0,
                transition: `opacity 0.3s ease-out ${i * 0.08 + 0.8}s`,
              }}
            >
              {item.score}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
