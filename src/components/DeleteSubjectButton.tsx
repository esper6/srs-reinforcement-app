"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DeleteSubjectButtonProps {
  slug: string;
  name: string;
  conceptCount: number;
  masteryCount: number;
  vocabCount: number;
}

export default function DeleteSubjectButton({
  slug,
  name,
  conceptCount,
  masteryCount,
  vocabCount,
}: DeleteSubjectButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/curriculum/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Delete failed (${res.status})`);
        setPending(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[var(--foreground)] opacity-30 hover:opacity-100 hover:text-[var(--neon-magenta)] font-[family-name:var(--font-share-tech-mono)] transition-colors tracking-wide"
      >
        Delete subject
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-[var(--surface)] border border-[var(--neon-magenta)]/40 rounded-lg max-w-md w-full p-6 box-glow-magenta"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg text-[var(--neon-magenta)] mb-3 glow-magenta tracking-wide">
              Delete &ldquo;{name}&rdquo;?
            </h2>
            <p className="text-sm text-[var(--foreground)]/70 mb-3">
              This permanently deletes:
            </p>
            <ul className="text-sm text-[var(--foreground)]/90 mb-4 space-y-1 list-disc list-inside font-[family-name:var(--font-share-tech-mono)]">
              <li>
                {conceptCount} concept{conceptCount === 1 ? "" : "s"}
              </li>
              <li>
                {masteryCount} round{masteryCount === 1 ? "" : "s"} of mastery (across all users)
              </li>
              <li>
                {vocabCount} vocab word{vocabCount === 1 ? "" : "s"}
              </li>
            </ul>
            <p className="text-xs text-[var(--foreground)]/50 mb-5">
              All chat history, vocab progress, and round results for this subject will be removed. This cannot be undone.
            </p>
            {error && (
              <p className="text-sm text-[var(--neon-magenta)] mb-3">{error}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="px-4 py-2 text-sm border border-[var(--border-retro)] text-[var(--foreground)]/70 hover:text-[var(--foreground)] rounded font-[family-name:var(--font-share-tech-mono)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="btn-neon-magenta px-4 py-2 text-sm rounded font-[family-name:var(--font-share-tech-mono)] border disabled:opacity-50"
              >
                {pending ? "Deleting..." : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
