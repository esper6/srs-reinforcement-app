import Link from "next/link";

interface SubjectCardProps {
  name: string;
  slug: string;
  description: string;
  conceptCount: number;
  averageMastery: number | null;
}

export default function SubjectCard({
  name,
  slug,
  description,
  conceptCount,
  averageMastery,
}: SubjectCardProps) {
  const mastery = averageMastery ?? 0;
  const masteryColor =
    mastery >= 70
      ? "text-[var(--neon-green)]"
      : mastery >= 40
        ? "text-yellow-400"
        : "text-[var(--foreground)] opacity-40";

  const barClass =
    mastery >= 70
      ? "progress-glow-green"
      : mastery >= 40
        ? "progress-glow-yellow"
        : "bg-[var(--border-retro)]";

  return (
    <Link
      href={`/subject/${slug}`}
      className="block bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-5 hover:box-glow-cyan hover:border-[var(--neon-cyan)]/30 transition-all duration-300 group"
    >
      <h3 className="font-[family-name:var(--font-share-tech-mono)] text-[var(--neon-cyan)] font-semibold text-lg mb-1 group-hover:glow-cyan transition-all">
        {name}
      </h3>
      <p className="text-[var(--foreground)] opacity-50 text-sm mb-4 line-clamp-2">{description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[var(--foreground)] opacity-30 text-xs font-[family-name:var(--font-share-tech-mono)]">
          {conceptCount} concepts
        </span>
        <span className={`text-sm font-medium font-[family-name:var(--font-share-tech-mono)] ${masteryColor}`}>
          {averageMastery !== null ? `${Math.round(mastery)}%` : "Not started"}
        </span>
      </div>
      {averageMastery !== null && (
        <div className="mt-3 h-1.5 bg-[var(--surface-light)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barClass}`}
            style={{ width: `${Math.min(100, mastery)}%` }}
          />
        </div>
      )}
    </Link>
  );
}
