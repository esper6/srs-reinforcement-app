"use client";

import { useEffect, useState } from "react";
import { SubMasteryData } from "@/lib/types";

interface SubMasteryBreakdownProps {
  subMasteries: SubMasteryData[];
  overallScore: number;
}

export default function SubMasteryBreakdown({
  subMasteries,
  overallScore,
}: SubMasteryBreakdownProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (subMasteries.length === 0) return null;

  const sorted = [...subMasteries].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--foreground)] opacity-50 uppercase tracking-wider">
          Facet Breakdown
        </h4>
        <span className="text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--foreground)] opacity-30">
          Overall: {overallScore}%
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((facet, i) => {
          const barColor =
            facet.score >= 70
              ? "bg-[var(--neon-green)]"
              : facet.score >= 40
                ? "bg-yellow-400"
                : "bg-red-400";
          const glowClass =
            facet.score >= 70
              ? "shadow-[0_0_8px_var(--neon-green)]"
              : "";

          return (
            <div
              key={facet.name}
              className="flex items-center gap-3"
              style={{
                opacity: animated ? 1 : 0,
                transform: animated ? "translateX(0)" : "translateX(-12px)",
                transition: `all 0.4s ease-out ${i * 0.1}s`,
              }}
            >
              <span className="text-xs font-[family-name:var(--font-share-tech-mono)] min-w-[120px] truncate text-right text-[var(--foreground)] opacity-60">
                {facet.name}
              </span>
              <div className="flex-1 h-2.5 bg-[var(--surface-light)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} ${glowClass} transition-all duration-700 ease-out`}
                  style={{
                    width: animated ? `${Math.min(100, facet.score)}%` : "0%",
                    transitionDelay: `${i * 0.1 + 0.15}s`,
                  }}
                />
              </div>
              <span
                className="text-xs font-[family-name:var(--font-share-tech-mono)] min-w-[2.5rem] text-[var(--foreground)] opacity-60"
                style={{
                  opacity: animated ? 0.6 : 0,
                  transition: `opacity 0.3s ease-out ${i * 0.1 + 0.5}s`,
                }}
              >
                {facet.score}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
