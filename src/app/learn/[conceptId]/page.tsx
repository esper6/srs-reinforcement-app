"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import ChatInterface from "@/components/ChatInterface";
import { SubMasteryData } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [started, setStarted] = useState(false);

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

  const navigateBack = () => {
    const slug = conceptInfo?.section.curriculum.slug;
    if (slug) {
      router.push(`/subject/${slug}`);
      router.refresh();
    } else {
      router.back();
    }
  };

  // Step 1: Show lesson before assessment
  if (!started) {
    return (
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        <div className="px-4 pt-3">
          <button
            onClick={navigateBack}
            className="text-[var(--foreground)] opacity-40 hover:text-[var(--neon-cyan)] text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
          >
            &larr; Back
          </button>
        </div>

        {!conceptInfo ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <h1 className="font-[family-name:var(--font-share-tech-mono)] text-xl font-bold text-[var(--neon-cyan)] mb-1 glow-cyan tracking-wide">
              {conceptInfo.title}
            </h1>
            <p className="text-[var(--foreground)]/30 text-xs font-[family-name:var(--font-share-tech-mono)] mb-6">
              {conceptInfo.section.name} &middot; {conceptInfo.section.curriculum.name}
            </p>

            <div className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-6 mb-6 prose prose-invert prose-sm max-w-none text-[var(--foreground)]/80 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {conceptInfo.lessonMarkdown}
              </ReactMarkdown>
            </div>

            <div className="flex justify-center pb-8">
              <button
                onClick={() => setStarted(true)}
                className="px-8 py-3 rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm font-medium btn-neon animate-pulse-glow transition-all duration-300 hover:scale-105 active:scale-95"
              >
                Begin Assessment
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Assessment chat
  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      <div className="px-4 pt-3">
        <button
          onClick={navigateBack}
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
        onComplete={navigateBack}
      />
    </div>
  );
}
