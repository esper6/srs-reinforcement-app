"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ReviewQueueBanner() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/review")
      .then((r) => r.json())
      .then((data) => setCount(data.totalDue))
      .catch(() => setCount(0));
  }, []);

  if (count === null || count === 0) return null;

  return (
    <Link
      href="/review"
      className="block bg-[var(--surface)] border border-[var(--neon-magenta)]/30 rounded-lg p-4 mb-6 hover:box-glow-magenta transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[var(--neon-magenta)] font-medium font-[family-name:var(--font-share-tech-mono)]">
            {count} concept{count !== 1 ? "s" : ""} ready for review
          </p>
          <p className="text-[var(--foreground)] opacity-40 text-sm">
            Keep your knowledge fresh
          </p>
        </div>
        <span className="btn-neon-magenta px-4 py-2 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)]">
          Start Review
        </span>
      </div>
    </Link>
  );
}
