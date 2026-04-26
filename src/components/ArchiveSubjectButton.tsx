"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ArchiveSubjectButtonProps {
  slug: string;
  archived: boolean;
}

export default function ArchiveSubjectButton({
  slug,
  archived,
}: ArchiveSubjectButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/curriculum/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status})`);
        setPending(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="text-xs text-[var(--foreground)] opacity-30 hover:opacity-100 hover:text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] transition-colors tracking-wide disabled:opacity-20"
      >
        {pending ? "..." : archived ? "Unarchive" : "Archive"}
      </button>
      {error && (
        <span className="text-xs text-[var(--neon-magenta)] mt-1">{error}</span>
      )}
    </div>
  );
}
