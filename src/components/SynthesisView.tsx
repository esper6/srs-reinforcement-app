"use client";

import { useEffect, useRef, useState } from "react";
import { useSynthesis, type SynthesisResult } from "@/hooks/useSynthesis";
import MessageBubble from "./MessageBubble";

interface SynthesisViewProps {
  conceptId: string;
  conceptTitle: string;
  facetNames: string[];
  onResolve: (result: SynthesisResult) => void;
}

const START_TRIGGER = "[START SYNTHESIS] Ask your synthesis question.";

export default function SynthesisView({
  conceptId,
  conceptTitle,
  facetNames,
  onResolve,
}: SynthesisViewProps) {
  const { messages, isLoading, error, sendMessage, synthesisResult } = useSynthesis({
    conceptId,
  });
  const [input, setInput] = useState("");
  const startedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isResolved = synthesisResult != null;

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      sendMessage(START_TRIGGER);
    }
  }, [sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const visibleMessages = messages.filter(
    (m) => !(m.role === "user" && m.content === START_TRIGGER)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header — capstone-flavored, magenta accent instead of cyan */}
      <div className="border-b border-[var(--border-retro)] px-4 py-3 bg-[var(--surface)]/60">
        <div className="text-xs text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)] tracking-widest mb-1">
          ⚛ SYNTHESIS · CAPSTONE
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <div className="text-lg text-[var(--neon-magenta)] font-[family-name:var(--font-share-tech-mono)] glow-magenta">
            {conceptTitle}
          </div>
        </div>
        <div className="text-xs text-[var(--foreground)]/40 mt-1 font-[family-name:var(--font-share-tech-mono)]">
          Integrating: {facetNames.join(" · ")}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {visibleMessages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        {error && (
          <div className="text-red-300 text-sm border border-red-500/40 bg-red-900/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {isResolved && synthesisResult ? (
        <div className="border-t border-[var(--neon-magenta)]/40 p-3 bg-[var(--surface)]/60 flex items-center justify-between gap-3">
          <div className="text-sm text-[var(--neon-magenta)] font-[family-name:var(--font-share-tech-mono)]">
            ⚛ Synthesis complete
          </div>
          <button
            onClick={() => onResolve(synthesisResult)}
            className="px-5 py-2 bg-[var(--neon-magenta)]/10 border border-[var(--neon-magenta)]/40 text-[var(--neon-magenta)] rounded font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-magenta)]/20 hover:border-[var(--neon-magenta)]/60 transition-all duration-200"
            autoFocus
          >
            Continue ▶
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--border-retro)] p-3 bg-[var(--surface)]/60"
        >
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={
                isLoading ? "..." : "Your answer (Enter to send, Shift+Enter for newline)"
              }
              rows={3}
              className="flex-1 bg-[var(--surface)] border border-[var(--border-retro)] rounded px-3 py-2 text-[var(--foreground)] text-sm font-[family-name:var(--font-geist-mono)] resize-none focus:outline-none focus:border-[var(--neon-magenta)]/50 disabled:opacity-50 placeholder:text-[var(--foreground)]/30"
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 self-end bg-[var(--neon-magenta)]/10 border border-[var(--neon-magenta)]/40 text-[var(--neon-magenta)] rounded font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-magenta)]/20 hover:border-[var(--neon-magenta)]/60 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
