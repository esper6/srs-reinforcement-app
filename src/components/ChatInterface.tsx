"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessageData } from "@/lib/types";

// Extra-credit-only chat surface. Used by /learn/[conceptId] in the
// extra_credit page state, where the user explores a concept after a round
// without affecting mastery. When entered straight from a round, the round
// transcript is bolted on top with cool styling — visual contrast against
// the warm EC palette signals "that was the test, this is the chat."

interface ChatInterfaceProps {
  conceptId: string;
  conceptTitle: string;
  lessonMarkdown?: string;
  precedingTranscript?: ChatMessageData[];
  precedingFacetName?: string;
  precedingSessionId?: string | null;
}

export default function ChatInterface({
  conceptId,
  conceptTitle,
  lessonMarkdown,
  precedingTranscript,
  precedingFacetName,
  precedingSessionId,
}: ChatInterfaceProps) {
  const { messages, isLoading, error, sendMessage } = useChat({
    conceptId,
    precedingSessionId,
  });
  const [input, setInput] = useState("");
  const [showLesson, setShowLesson] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasPreceding = (precedingTranscript?.length ?? 0) > 0;

  useEffect(() => {
    // When EC opens with a round transcript, leave the user scrolled to the
    // top so they can read what they just chatted about. Once they engage
    // (send a message) or toggle the lesson, autoscroll resumes normally.
    if (messages.length === 0 && hasPreceding) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showLesson, hasPreceding]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--extra-credit-bg)" }}>
      <div
        className="shrink-0 border-b px-4 py-3 flex items-start justify-between gap-3"
        style={{
          background: "var(--extra-credit-surface)",
          borderColor: "var(--extra-credit-border)",
        }}
      >
        <div className="min-w-0">
          <h2
            className="font-medium text-sm font-[family-name:var(--font-share-tech-mono)] truncate"
            style={{ color: "var(--extra-credit-text)" }}
          >
            {conceptTitle}
          </h2>
          <span
            className="text-xs font-[family-name:var(--font-share-tech-mono)]"
            style={{ color: "var(--extra-credit-accent)" }}
          >
            extra credit · scores locked in
          </span>
        </div>
        {lessonMarkdown && (
          <button
            onClick={() => setShowLesson((v) => !v)}
            className="shrink-0 text-[11px] font-[family-name:var(--font-share-tech-mono)] tracking-wider hover:opacity-100 transition-opacity"
            style={{ color: "var(--extra-credit-accent)", opacity: 0.6 }}
          >
            {showLesson ? "Hide Lesson ▴" : "Lesson ▾"}
          </button>
        )}
      </div>

      {lessonMarkdown && showLesson && (
        <div
          className="shrink-0 border-b lesson-markdown px-4 py-3 max-h-[40vh] overflow-y-auto"
          style={{
            background: "var(--extra-credit-surface)",
            borderColor: "var(--extra-credit-border)",
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonMarkdown}</ReactMarkdown>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasPreceding && (
          <>
            <SectionDivider
              label={
                precedingFacetName
                  ? `round · ${precedingFacetName}`
                  : "previous round"
              }
              tone="cool"
            />
            {precedingTranscript!.map((msg, i) => (
              <MessageBubble key={`r-${i}`} role={msg.role} content={msg.content} />
            ))}
            <SectionDivider label="extra credit" tone="warm" />
          </>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={`ec-${i}`} role={msg.role} content={msg.content} warm />
        ))}
        {isLoading && messages[messages.length - 1]?.content === "" && (
          <div className="flex gap-1 px-4 py-2">
            <span
              className="w-2 h-2 rounded-full animate-bounce opacity-60"
              style={{ background: "var(--extra-credit-accent)" }}
            />
            <span
              className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.1s] opacity-60"
              style={{ background: "var(--extra-credit-accent)" }}
            />
            <span
              className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] opacity-60"
              style={{ background: "var(--extra-credit-accent)" }}
            />
          </div>
        )}
        {error && (
          <div className="text-red-300 text-sm border border-red-500/40 bg-red-900/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t p-4"
        style={{
          background: "var(--extra-credit-surface)",
          borderColor: "var(--extra-credit-border)",
        }}
      >
        {!input && (
          <div
            className="text-[10px] font-[family-name:var(--font-share-tech-mono)] mb-2"
            style={{ color: "var(--extra-credit-accent)", opacity: 0.4 }}
          >
            Extra Credit mode engaged!
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about the topic..."
            rows={2}
            className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none font-[family-name:var(--font-geist-mono)]"
            style={{
              background: "var(--extra-credit-surface-light)",
              borderColor: "var(--extra-credit-border)",
              color: "var(--extra-credit-text)",
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] disabled:opacity-30 disabled:cursor-not-allowed self-end"
            style={{
              color: "var(--extra-credit-accent)",
              border: "1px solid var(--extra-credit-border)",
            }}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionDivider({ label, tone }: { label: string; tone: "cool" | "warm" }) {
  const color =
    tone === "cool" ? "var(--neon-cyan)" : "var(--extra-credit-accent)";
  return (
    <div
      className="flex items-center gap-3 py-1 select-none"
      style={{ color, opacity: 0.5 }}
    >
      <div className="flex-1 h-px" style={{ background: "currentColor", opacity: 0.4 }} />
      <span className="text-[10px] font-[family-name:var(--font-share-tech-mono)] tracking-[0.3em] uppercase">
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "currentColor", opacity: 0.4 }} />
    </div>
  );
}
