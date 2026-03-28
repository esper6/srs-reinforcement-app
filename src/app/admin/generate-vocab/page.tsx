"use client";

import { useEffect, useState } from "react";

interface ConceptInfo {
  id: string;
  title: string;
  vocabCount: number;
}

interface SectionInfo {
  name: string;
  concepts: ConceptInfo[];
}

interface CurriculumInfo {
  slug: string;
  name: string;
  sections: SectionInfo[];
}

interface GeneratedVocab {
  Term: string;
  Definition: string;
}

interface PendingReview {
  conceptId: string;
  conceptTitle: string;
  vocab: GeneratedVocab[];
  duplicatesRemoved?: number;
}

type Status = "idle" | "generating" | "reviewing" | "saving";

export default function GenerateVocabPage() {
  const [curricula, setCurricula] = useState<CurriculumInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>("idle");
  const [currentConcept, setCurrentConcept] = useState<string | null>(null);
  const [review, setReview] = useState<PendingReview | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<{ concept: string; count: number }[]>([]);

  useEffect(() => {
    fetch("/api/admin/generate-vocab")
      .then((r) => r.json())
      .then((data) => {
        setCurricula(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggleConcept(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const allIds = curricula.flatMap((c) =>
      c.sections.flatMap((s) => s.concepts.map((con) => con.id))
    );
    setSelected(new Set(allIds));
  }

  function selectMissing() {
    const missingIds = curricula.flatMap((c) =>
      c.sections.flatMap((s) =>
        s.concepts.filter((con) => con.vocabCount === 0).map((con) => con.id)
      )
    );
    setSelected(new Set(missingIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function startGeneration() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setQueue(ids);
    setProgress({ done: 0, total: ids.length });
    setLog([]);
    await generateNext(ids, 0);
  }

  async function generateNext(ids: string[], index: number) {
    if (index >= ids.length) {
      setStatus("idle");
      setCurrentConcept(null);
      return;
    }

    const conceptId = ids[index];
    setCurrentConcept(conceptId);
    setStatus("generating");

    try {
      const res = await fetch("/api/admin/generate-vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId }),
      });

      if (!res.ok) {
        const err = await res.json();
        setLog((prev) => [...prev, { concept: conceptId, count: -1 }]);
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        console.error("Generation failed:", err.error);
        await generateNext(ids, index + 1);
        return;
      }

      const data: PendingReview = await res.json();
      setReview(data);
      setStatus("reviewing");
      // Wait for user to approve/skip — handled by handleApprove/handleSkip
    } catch {
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      await generateNext(ids, index + 1);
    }
  }

  async function handleApprove() {
    if (!review) return;
    setStatus("saving");

    await fetch("/api/admin/generate-vocab", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conceptId: review.conceptId, vocab: review.vocab }),
    });

    setLog((prev) => [...prev, { concept: review.conceptTitle, count: review.vocab.length }]);
    setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    setReview(null);

    // Update local counts
    setCurricula((prev) =>
      prev.map((c) => ({
        ...c,
        sections: c.sections.map((s) => ({
          ...s,
          concepts: s.concepts.map((con) =>
            con.id === review.conceptId
              ? { ...con, vocabCount: review.vocab.length }
              : con
          ),
        })),
      }))
    );

    const idx = queue.indexOf(review.conceptId);
    await generateNext(queue, idx + 1);
  }

  function handleRemoveVocab(index: number) {
    if (!review) return;
    setReview({
      ...review,
      vocab: review.vocab.filter((_, i) => i !== index),
    });
  }

  async function handleSkip() {
    if (!review) return;
    setLog((prev) => [...prev, { concept: review.conceptTitle, count: 0 }]);
    setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    setReview(null);
    const idx = queue.indexOf(review.conceptId);
    await generateNext(queue, idx + 1);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  // Review mode
  if (status === "reviewing" && review) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-[family-name:var(--font-share-tech-mono)] text-lg text-[var(--neon-purple)] glow-purple">
            Review: {review.conceptTitle}
          </h1>
          <span className="text-[var(--foreground)]/40 text-xs font-[family-name:var(--font-share-tech-mono)]">
            {progress.done + 1} / {progress.total}
          </span>
        </div>

        {review.duplicatesRemoved ? (
          <p className="text-[var(--foreground)]/40 text-xs font-[family-name:var(--font-share-tech-mono)] mb-3">
            {review.duplicatesRemoved} duplicate{review.duplicatesRemoved > 1 ? "s" : ""} removed (already in another concept)
          </p>
        ) : null}

        <div className="space-y-2 mb-6">
          {review.vocab.map((v, i) => (
            <div
              key={i}
              className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] mb-1">
                  {v.Term}
                </p>
                <p className="text-[var(--foreground)]/60 text-sm">{v.Definition}</p>
              </div>
              <button
                onClick={() => handleRemoveVocab(i)}
                className="text-red-400/50 hover:text-red-400 text-xs font-[family-name:var(--font-share-tech-mono)] transition-colors flex-shrink-0 mt-1"
              >
                remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={review.vocab.length === 0}
            className="px-6 py-2 bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/40 text-[var(--neon-green)] rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-green)]/20 transition-all duration-200 disabled:opacity-30"
          >
            Save {review.vocab.length} terms
          </button>
          <button
            onClick={handleSkip}
            className="px-5 py-2 bg-[var(--surface)] border border-[var(--border-retro)] text-[var(--foreground)]/50 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:border-[var(--foreground)]/30 transition-all duration-200"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Generating state
  if (status === "generating" || status === "saving") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <div className="text-center py-12">
          <div className="text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] text-lg mb-2 animate-pulse">
            {status === "saving" ? "Saving..." : "Generating vocab..."}
          </div>
          <p className="text-[var(--foreground)]/40 text-sm mb-4">
            {progress.done + 1} of {progress.total}
          </p>
          <div className="w-48 mx-auto h-1 bg-[var(--surface-light)] rounded-full overflow-hidden">
            <div
              className="h-full progress-glow-cyan transition-all duration-300"
              style={{ width: `${((progress.done + 1) / progress.total) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Selection mode
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-purple)] mb-2 glow-purple tracking-wide">
        Generate Vocab
      </h1>
      <p className="text-[var(--foreground)]/50 text-sm mb-4">
        Select concepts to generate vocab terms from their lesson content. Uses the cheap model.
      </p>

      {/* Bulk actions */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30 rounded hover:bg-[var(--neon-cyan)]/10 transition-all"
        >
          Select all
        </button>
        <button
          onClick={selectMissing}
          className="px-3 py-1.5 text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--neon-magenta)] border border-[var(--neon-magenta)]/30 rounded hover:bg-[var(--neon-magenta)]/10 transition-all"
        >
          Select missing vocab
        </button>
        <button
          onClick={clearSelection}
          className="px-3 py-1.5 text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--foreground)]/40 border border-[var(--border-retro)] rounded hover:border-[var(--foreground)]/30 transition-all"
        >
          Clear
        </button>
        {selected.size > 0 && (
          <button
            onClick={startGeneration}
            className="ml-auto px-5 py-1.5 text-xs font-[family-name:var(--font-share-tech-mono)] bg-[var(--neon-green)]/10 text-[var(--neon-green)] border border-[var(--neon-green)]/40 rounded hover:bg-[var(--neon-green)]/20 transition-all"
          >
            Generate ({selected.size})
          </button>
        )}
      </div>

      {/* Log from previous run */}
      {log.length > 0 && (
        <div className="mb-6 p-3 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg">
          <p className="text-[var(--foreground)]/40 text-[10px] font-[family-name:var(--font-share-tech-mono)] uppercase tracking-wider mb-2">
            Last run
          </p>
          {log.map((entry, i) => (
            <p key={i} className="text-xs text-[var(--foreground)]/60">
              {entry.concept}:{" "}
              {entry.count > 0 ? (
                <span className="text-[var(--neon-green)]">{entry.count} terms saved</span>
              ) : entry.count === 0 ? (
                <span className="text-[var(--foreground)]/30">skipped</span>
              ) : (
                <span className="text-[var(--neon-magenta)]">failed</span>
              )}
            </p>
          ))}
        </div>
      )}

      {/* Curriculum list */}
      <div className="space-y-6">
        {curricula.map((curriculum) => (
          <div key={curriculum.slug}>
            <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg text-[var(--neon-cyan)] mb-3 glow-cyan">
              {curriculum.name}
            </h2>
            {curriculum.sections.map((section) => (
              <div key={section.name} className="mb-4">
                <h3 className="font-[family-name:var(--font-share-tech-mono)] text-xs text-[var(--neon-magenta)]/60 uppercase tracking-wider mb-2 pl-1">
                  {section.name}
                </h3>
                <div className="space-y-1">
                  {section.concepts.map((concept) => (
                    <label
                      key={concept.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                        selected.has(concept.id)
                          ? "bg-[var(--neon-cyan)]/5 border border-[var(--neon-cyan)]/20"
                          : "hover:bg-[var(--surface)] border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(concept.id)}
                        onChange={() => toggleConcept(concept.id)}
                        className="accent-[var(--neon-cyan)]"
                      />
                      <span className="text-sm text-[var(--foreground)]/80 flex-1">
                        {concept.title}
                      </span>
                      {concept.vocabCount > 0 ? (
                        <span className="text-[10px] text-[var(--neon-green)]/60 font-[family-name:var(--font-share-tech-mono)]">
                          {concept.vocabCount} terms
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--foreground)]/20 font-[family-name:var(--font-share-tech-mono)]">
                          no vocab
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
