import Link from "next/link";

interface SubjectQueueButtonsProps {
  slug: string;
  vocabNewCount: number;
  vocabDueCount: number;
}

// Per-subject action buttons. Round-side queues are rendered separately by
// <RoundQueue /> below this component on the subject page; this row only
// surfaces the vocab queues, which run on a separate SRS engine.
export default function SubjectQueueButtons({
  slug,
  vocabNewCount,
  vocabDueCount,
}: SubjectQueueButtonsProps) {
  const nothingDue = vocabNewCount === 0 && vocabDueCount === 0;

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {vocabNewCount > 0 && (
        <Link
          href={`/drill/${slug}?mode=lessons`}
          className="btn-neon-green px-5 py-2.5 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-2"
        >
          <span>Vocab Lessons</span>
          <span className="bg-[var(--neon-green)]/20 text-[var(--neon-green)] px-2 py-0.5 rounded text-xs">
            {vocabNewCount}
          </span>
        </Link>
      )}
      {vocabDueCount > 0 && (
        <Link
          href={`/drill/${slug}?mode=reviews`}
          className="btn-neon-purple px-5 py-2.5 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-2"
        >
          <span>Vocab Reviews</span>
          <span className="bg-[var(--neon-purple)]/20 text-[var(--neon-purple)] px-2 py-0.5 rounded text-xs">
            {vocabDueCount}
          </span>
        </Link>
      )}
      {nothingDue && (
        <div className="text-[var(--foreground)] opacity-40 text-sm font-[family-name:var(--font-share-tech-mono)] py-2">
          Vocab is up to date — round queue below
        </div>
      )}
    </div>
  );
}
