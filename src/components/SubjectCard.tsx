import Link from "next/link";

interface SubjectCardProps {
  name: string;
  slug: string;
  description: string | null;
  conceptCount: number;
  masteredCount: number;
  archived?: boolean;
}

export default function SubjectCard({
  name,
  slug,
  description,
  conceptCount,
  masteredCount,
  archived = false,
}: SubjectCardProps) {
  const pct = conceptCount > 0 ? (masteredCount / conceptCount) * 100 : 0;
  const accent =
    pct >= 70
      ? "text-[var(--neon-green)]"
      : pct >= 30
        ? "text-yellow-400"
        : "text-[var(--foreground)] opacity-60";

  const barClass =
    pct >= 70
      ? "progress-glow-green"
      : pct >= 30
        ? "progress-glow-yellow"
        : "bg-[var(--border-retro)]";

  return (
    <Link
      href={`/subject/${slug}`}
      className="block bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-5 hover:box-glow-cyan hover:border-[var(--neon-cyan)]/30 transition-all duration-300 group"
    >
      <h2 className="font-[family-name:var(--font-share-tech-mono)] text-[var(--neon-cyan)] font-semibold text-lg mb-1 group-hover:glow-cyan transition-all">
        {name}
        {archived && (
          <span className="ml-2 align-middle text-[10px] text-[var(--foreground)]/60 border border-[var(--border-retro)] rounded px-1.5 py-0.5 tracking-wide font-normal">
            archived
          </span>
        )}
      </h2>
      <p className="text-[var(--foreground)] opacity-70 text-sm mb-4 line-clamp-2">{description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[var(--foreground)] opacity-60 text-xs font-[family-name:var(--font-share-tech-mono)]">
          {conceptCount} concept{conceptCount === 1 ? "" : "s"}
        </span>
        <span className={`text-sm font-medium font-[family-name:var(--font-share-tech-mono)] ${accent}`}>
          {masteredCount > 0
            ? `${masteredCount} / ${conceptCount} mastered`
            : conceptCount === 0
              ? "—"
              : "Not started"}
        </span>
      </div>
      {conceptCount > 0 && (
        <div className="mt-3 h-1.5 bg-[var(--surface-light)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </Link>
  );
}
