import Link from "next/link";

// Trophy shelf for concepts that have cleared synthesis. Subject-scoped.
// Click-through still goes to /learn/[id], which renders the "MASTERED"
// terminal screen for that concept.

interface BurnedConcept {
  id: string;
  title: string;
  masteredAt: Date | null;
}

interface BurnedShelfProps {
  concepts: BurnedConcept[];
}

function formatRelative(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  if (ms < HOUR) return "just now";
  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours}h ago`;
  }
  if (ms < WEEK) {
    const days = Math.round(ms / DAY);
    return `${days}d ago`;
  }
  if (ms < 30 * DAY) {
    const weeks = Math.round(ms / WEEK);
    return `${weeks}w ago`;
  }
  if (ms < 365 * DAY) {
    const months = Math.round(ms / (30 * DAY));
    return `${months}mo ago`;
  }
  const years = Math.round(ms / (365 * DAY));
  return `${years}y ago`;
}

export default function BurnedShelf({ concepts }: BurnedShelfProps) {
  if (concepts.length === 0) return null;

  // Most recent kills at the top.
  const sorted = [...concepts].sort((a, b) => {
    const at = a.masteredAt?.getTime() ?? 0;
    const bt = b.masteredAt?.getTime() ?? 0;
    return bt - at;
  });
  const now = new Date();

  return (
    <div className="mt-8 mb-6">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--neon-green)]/70 uppercase tracking-wider glow-green">
          Burned
        </h2>
        <span className="text-xs text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)]">
          {concepts.length} mastered
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((c) => (
          <Link
            key={c.id}
            href={`/learn/${c.id}`}
            className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--neon-green)]/20 rounded-lg px-4 py-2.5 hover:border-[var(--neon-green)]/50 transition-all duration-300 group"
          >
            <span className="text-[var(--neon-green)] text-lg shrink-0 group-hover:glow-green transition-all">
              ✓
            </span>
            <span className="flex-1 min-w-0 text-sm text-[var(--foreground)]/80 truncate">
              {c.title}
            </span>
            <span className="text-xs text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)] shrink-0">
              {c.masteredAt ? formatRelative(c.masteredAt, now) : "—"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
