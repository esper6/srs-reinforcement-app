"use client";

import { calculateCurrentMastery, getReviewThreshold } from "@/lib/mastery";
import Link from "next/link";

interface DecayItem {
  conceptId: string;
  title: string;
  score: number;
  decayRate: number;
  lastReviewedAt: string;
}

interface DecayQueueProps {
  items: DecayItem[];
}

function timeUntilDue(score: number, decayRate: number, lastReviewedAt: Date): string {
  // Solve: score * e^(-decayRate * days) = threshold
  // days = -ln(threshold / score) / decayRate
  const threshold = getReviewThreshold(score);
  if (score <= threshold) return "Now";

  const daysUntil = -Math.log(threshold / score) / decayRate;
  const daysSince = (Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysRemaining = daysUntil - daysSince;

  if (daysRemaining <= 0) return "Now";

  if (daysRemaining < 1 / 24) {
    const mins = Math.ceil(daysRemaining * 24 * 60);
    return `${mins}m`;
  }
  if (daysRemaining < 1) {
    const hours = Math.floor(daysRemaining * 24);
    const mins = Math.ceil((daysRemaining * 24 - hours) * 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (daysRemaining < 7) {
    const days = Math.floor(daysRemaining);
    const hours = Math.ceil((daysRemaining - days) * 24);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  return `${Math.ceil(daysRemaining)}d`;
}

export default function DecayQueue({ items }: DecayQueueProps) {
  if (items.length === 0) return null;

  // Calculate current mastery and time until due for each
  const withDecay = items.map((item) => {
    const lastReviewed = new Date(item.lastReviewedAt);
    const current = calculateCurrentMastery(item.score, item.decayRate, lastReviewed);
    const timeLeft = timeUntilDue(item.score, item.decayRate, lastReviewed);
    const isDue = current < getReviewThreshold(item.score);
    return { ...item, current, timeLeft, isDue, lastReviewed };
  });

  // Sort: due items first (lowest mastery), then by soonest to become due
  withDecay.sort((a, b) => {
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;
    if (a.isDue && b.isDue) return a.current - b.current;
    // Both not due: sort by soonest to become due
    return a.current - b.current;
  });

  return (
    <div className="mt-8 mb-6">
      <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--foreground)] opacity-50 mb-3 uppercase tracking-wider">
        Decay Queue
      </h2>
      <div className="space-y-1">
        {withDecay.map((item) => (
          <Link
            key={item.conceptId}
            href={`/learn/${item.conceptId}`}
            className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-[var(--surface-light)] transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  item.isDue
                    ? "bg-[var(--neon-magenta)] animate-pulse"
                    : "bg-[var(--neon-green)] opacity-50"
                }`}
              />
              <span className="text-[var(--foreground)] text-sm truncate group-hover:text-[var(--neon-cyan)] transition-colors">
                {item.title}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <span className="text-[var(--foreground)] opacity-30 text-xs font-[family-name:var(--font-share-tech-mono)]">
                {Math.round(item.current)}%
              </span>
              <span
                className={`text-xs font-[family-name:var(--font-share-tech-mono)] min-w-[4rem] text-right ${
                  item.isDue
                    ? "text-[var(--neon-magenta)]"
                    : "text-[var(--foreground)] opacity-40"
                }`}
              >
                {item.isDue ? "Due now" : item.timeLeft}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
