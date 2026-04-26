"use client";

import { useEffect, useRef, useState } from "react";
import { FacetLevel } from "@prisma/client";
import { useRound, type RoundResult } from "@/hooks/useRound";
import MessageBubble from "./MessageBubble";

interface RoundViewProps {
  conceptId: string;
  conceptTitle: string;
  facetName: string;
  currentLevel: FacetLevel;
  currentExpertStage: number;
  onResolve: (result: RoundResult) => void;
}

const LEVEL_LABEL: Record<FacetLevel, string> = {
  NOVICE: "Novice",
  APPRENTICE: "Apprentice",
  JOURNEYMAN: "Journeyman",
  EXPERT: "Expert",
};

function formatLevel(level: FacetLevel, expertStage: number): string {
  if (level === FacetLevel.EXPERT) return `Expert ${expertStage}/3`;
  return LEVEL_LABEL[level];
}

const START_TRIGGER = "[START ROUND] Ask your opening question.";

export default function RoundView({
  conceptId,
  conceptTitle,
  facetName,
  currentLevel,
  currentExpertStage,
  onResolve,
}: RoundViewProps) {
  const { messages, isLoading, error, sendMessage } = useRound({
    conceptId,
    onRoundResolve: onResolve,
  });
  const [input, setInput] = useState("");
  const startedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-fire the [START ROUND] trigger exactly once on mount
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

  // Hide the [START ROUND] trigger from the visible conversation
  const visibleMessages = messages.filter(
    (m) => !(m.role === "user" && m.content === START_TRIGGER)
  );

  // Question counter — student responses received + 1 (the next one Claude is asking).
  // Capped at 3 because that's the round's hard limit.
  const studentResponses = messages.filter(
    (m) => m.role === "user" && m.content !== START_TRIGGER
  ).length;
  const currentQuestion = Math.min(studentResponses + 1, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--border-retro)] px-4 py-3 bg-[var(--surface)]/60">
        <div className="text-xs text-[var(--foreground)]/40 font-[family-name:var(--font-share-tech-mono)] tracking-wide">
          {conceptTitle}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <div className="text-lg text-[var(--neon-cyan)] font-[family-name:var(--font-share-tech-mono)] glow-cyan">
            {facetName}
          </div>
          <div className="text-xs text-[var(--foreground)]/50 font-[family-name:var(--font-share-tech-mono)]">
            {formatLevel(currentLevel, currentExpertStage)} ──→ ?
          </div>
          <div className="ml-auto text-xs text-[var(--neon-magenta)]/80 font-[family-name:var(--font-share-tech-mono)]">
            Q{currentQuestion}/3
          </div>
        </div>
      </div>

      {/* Conversation */}
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

      {/* Input */}
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
            placeholder={isLoading ? "..." : "Your answer (Enter to send, Shift+Enter for newline)"}
            rows={2}
            className="flex-1 bg-[var(--surface)] border border-[var(--border-retro)] rounded px-3 py-2 text-[var(--foreground)] text-sm font-[family-name:var(--font-geist-mono)] resize-none focus:outline-none focus:border-[var(--neon-cyan)]/50 disabled:opacity-50 placeholder:text-[var(--foreground)]/30"
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 self-end bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/40 text-[var(--neon-cyan)] rounded font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-cyan)]/20 hover:border-[var(--neon-cyan)]/60 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
