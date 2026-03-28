import Link from "next/link";

interface SubjectQueueButtonsProps {
  slug: string;
  unstartedCount: number;
  reviewCount: number;
  vocabDueCount: number;
}

export default function SubjectQueueButtons({
  slug,
  unstartedCount,
  reviewCount,
  vocabDueCount,
}: SubjectQueueButtonsProps) {
  const nothingDue = unstartedCount === 0 && reviewCount === 0 && vocabDueCount === 0;

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {unstartedCount > 0 && (
        <Link
          href={`/learn/queue/${slug}`}
          className="btn-neon px-5 py-2.5 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-2"
        >
          <span>Lessons</span>
          <span className="bg-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] px-2 py-0.5 rounded text-xs">
            {unstartedCount}
          </span>
        </Link>
      )}
      {reviewCount > 0 && (
        <Link
          href={`/review?subject=${slug}`}
          className="btn-neon-magenta px-5 py-2.5 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-2"
        >
          <span>Reviews</span>
          <span className="bg-[var(--neon-magenta)]/20 text-[var(--neon-magenta)] px-2 py-0.5 rounded text-xs">
            {reviewCount}
          </span>
        </Link>
      )}
      {vocabDueCount > 0 && (
        <Link
          href={`/drill/${slug}`}
          className="btn-neon-green px-5 py-2.5 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-2"
        >
          <span>Drill</span>
          <span className="bg-[var(--neon-green)]/20 text-[var(--neon-green)] px-2 py-0.5 rounded text-xs">
            {vocabDueCount}
          </span>
        </Link>
      )}
      {nothingDue && (
        <div className="text-[var(--foreground)] opacity-40 text-sm font-[family-name:var(--font-share-tech-mono)] py-2">
          All caught up — check back later
        </div>
      )}
    </div>
  );
}
