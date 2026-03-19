"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import ChatInterface from "@/components/ChatInterface";
import { SubMasteryData } from "@/lib/types";

interface ConceptInfo {
  title: string;
  lessonMarkdown: string;
  section: {
    name: string;
    curriculum: { name: string; slug: string };
  };
}

export default function LearnPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params.conceptId as string;
  const [conceptInfo, setConceptInfo] = useState<ConceptInfo | null>(null);

  useEffect(() => {
    fetch(`/api/concept/${conceptId}`)
      .then((r) => r.json())
      .then((data) => setConceptInfo(data))
      .catch(() => {});
  }, [conceptId]);

  const handleMasteryUpdate = useCallback(
    (_score: number, _decayRate: number, _facets?: SubMasteryData[]) => {
      // Mastery graph is now rendered inline by ChatInterface
    },
    []
  );

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      <div className="px-4 pt-3">
        <button
          onClick={() => router.back()}
          className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
        >
          &larr; Back
        </button>
      </div>

      <ChatInterface
        conceptId={conceptId}
        conceptTitle={conceptInfo?.title ?? "Loading..."}
        mode="ASSESS"
        lessonMarkdown={conceptInfo?.lessonMarkdown}
        onMasteryUpdate={handleMasteryUpdate}
        onComplete={() => router.back()}
      />
    </div>
  );
}
