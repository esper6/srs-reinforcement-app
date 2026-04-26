"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import MessageBubble from "./MessageBubble";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Extra-credit-only chat surface. Used by /learn/[conceptId] in the
// extra_credit page state, where the user explores a concept after a round
// without affecting mastery.

interface ChatInterfaceProps {
  conceptId: string;
  conceptTitle: string;
  lessonMarkdown?: string;
}

export default function ChatInterface({
  conceptId,
  conceptTitle,
  lessonMarkdown,
}: ChatInterfaceProps) {
  const { messages, isLoading, error, sendMessage } = useChat({ conceptId });
  const [input, setInput] = useState("");
  const [showLesson, setShowLesson] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showLesson]);

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
        className="shrink-0 border-b px-4 py-3"
        style={{
          background: "var(--extra-credit-surface)",
          borderColor: "var(--extra-credit-border)",
        }}
      >
        <h2
          className="font-medium text-sm font-[family-name:var(--font-share-tech-mono)]"
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} warm />
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

      {lessonMarkdown && (
        <div className="border-t" style={{ borderColor: "var(--extra-credit-border)" }}>
          <button
            onClick={() => setShowLesson((v) => !v)}
            className="w-full px-4 py-2.5 text-left text-xs font-[family-name:var(--font-share-tech-mono)] flex items-center gap-2"
            style={{ color: "var(--extra-credit-accent)", opacity: 0.7 }}
          >
            <span
              style={{
                display: "inline-block",
                transform: showLesson ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms",
              }}
            >
              ▸
            </span>
            {showLesson ? "Hide Lesson" : "Show Lesson"}
          </button>
          {showLesson && (
            <div
              className="px-4 pb-4 lesson-markdown border-t pt-3"
              style={{ borderTopColor: "var(--extra-credit-border)" }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonMarkdown}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

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
