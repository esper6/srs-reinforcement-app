"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { SubMasteryData } from "@/lib/types";
import MessageBubble from "./MessageBubble";
import SubMasteryBreakdown from "./SubMasteryBreakdown";

interface ChatInterfaceProps {
  conceptId: string;
  conceptTitle: string;
  mode: "ASSESS" | "LEARN" | "REVIEW";
  lessonMarkdown?: string;
  onMasteryUpdate?: (score: number, decayRate: number, subMasteries?: SubMasteryData[]) => void;
  onComplete?: () => void;
  initialMessage?: string;
}

export default function ChatInterface({
  conceptId,
  conceptTitle,
  mode,
  lessonMarkdown,
  onMasteryUpdate,
  onComplete,
  initialMessage,
}: ChatInterfaceProps) {
  const { messages, isLoading, isExtraCredit, masteryResult, sendMessage } = useChat({
    conceptId,
    mode,
    onMasteryUpdate,
  });
  const [input, setInput] = useState("");
  const [showLesson, setShowLesson] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  useEffect(() => {
    if (!hasSentInitial.current) {
      hasSentInitial.current = true;
      const trigger =
        initialMessage ??
        (mode === "ASSESS"
          ? "[START ASSESSMENT] Ask your opening question."
          : mode === "LEARN"
            ? "[START LESSON] Begin teaching."
            : "[START REVIEW] Ask your review question.");
      sendMessage(trigger);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showLesson]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const modeColor = isExtraCredit
    ? ""
    : mode === "ASSESS"
      ? "text-[var(--neon-cyan)]"
      : mode === "LEARN"
        ? "text-[var(--neon-green)]"
        : "text-[var(--neon-magenta)]";

  // Split messages into assessment (before mastery scores) and extra credit (after)
  const displayMessages = messages.filter((m) => !(m.role === "user" && messages.indexOf(m) === 0));
  const splitIndex = masteryResult
    ? Math.max(0, masteryResult.messageCount - 1)
    : displayMessages.length;
  const assessmentMessages = displayMessages.slice(0, splitIndex);
  const extraCreditMessages = displayMessages.slice(splitIndex);

  return (
    <div className="flex flex-col h-full transition-colors duration-700" style={isExtraCredit ? { background: "var(--extra-credit-bg)" } : undefined}>
      {/* Header */}
      <div
        className="shrink-0 border-b px-4 py-3 transition-all duration-700"
        style={isExtraCredit
          ? { background: "var(--extra-credit-surface)", borderColor: "var(--extra-credit-border)" }
          : { background: "var(--surface)", borderColor: "var(--border-retro)" }
        }
      >
        <h2 className="text-[var(--foreground)] font-medium text-sm font-[family-name:var(--font-share-tech-mono)]">
          {conceptTitle}
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-[family-name:var(--font-share-tech-mono)] transition-all duration-700 ${modeColor}`}
            style={isExtraCredit ? { color: "var(--extra-credit-accent)" } : undefined}
          >
            {isExtraCredit ? "extra credit" : `${mode.toLowerCase()} mode`}
          </span>
          {isExtraCredit && (
            <span className="text-[10px] font-[family-name:var(--font-share-tech-mono)] italic" style={{ color: "var(--extra-credit-accent)", opacity: 0.5 }}>
              scores locked in
            </span>
          )}
        </div>
      </div>

      {/* Assessment messages — scrolls independently when graph is showing */}
      {masteryResult ? (
        <>
          {/* Collapsed assessment: scrollable but capped so graph stays visible */}
          <div className="shrink-0 max-h-[30vh] overflow-y-auto border-b border-[var(--border-retro)]">
            <div className="px-4 py-4 space-y-4">
              {assessmentMessages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} content={msg.content} />
              ))}
            </div>
          </div>

          {/* Graph card — fixed between assessment and extra credit, never scrolls away */}
          <div className="shrink-0 border-b border-[var(--border-retro)] bg-[var(--surface)] overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-[var(--border-retro)]">
              <div className="flex items-center justify-between">
                <h3 className="text-[var(--neon-green)] text-sm font-[family-name:var(--font-share-tech-mono)] glow-green">
                  Mastery: {masteryResult.score}%
                </h3>
                <span className="text-[var(--foreground)] opacity-20 text-[10px] font-[family-name:var(--font-share-tech-mono)] uppercase tracking-wider">
                  Assessment Complete
                </span>
              </div>
            </div>

            {masteryResult.subMasteries.length > 0 && (
              <div className="px-4 py-3">
                <SubMasteryBreakdown
                  subMasteries={masteryResult.subMasteries}
                  overallScore={masteryResult.score}
                />
              </div>
            )}

            {lessonMarkdown && (
              <div className="border-t border-[var(--border-retro)]">
                <button
                  onClick={() => setShowLesson((v) => !v)}
                  className="w-full px-4 py-2.5 text-left text-xs font-[family-name:var(--font-share-tech-mono)] text-[var(--foreground)] opacity-40 hover:opacity-70 hover:bg-[var(--surface-light)] transition-all flex items-center gap-2"
                >
                  <span className="transition-transform duration-200" style={{ display: "inline-block", transform: showLesson ? "rotate(90deg)" : "rotate(0deg)" }}>
                    &#9656;
                  </span>
                  {showLesson ? "Hide Lesson" : "Show Lesson"}
                </button>
                {showLesson && (
                  <div className="px-4 pb-4 text-sm text-[var(--foreground)] opacity-60 leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-geist-mono)] max-h-[250px] overflow-y-auto border-t border-[var(--border-retro)] pt-3">
                    {lessonMarkdown}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Extra credit messages — this is the main scrollable area now */}
          <div className="flex-1 overflow-y-auto transition-colors duration-700">
            {extraCreditMessages.length > 0 && (
              <div className="px-4 py-4 space-y-4">
                {extraCreditMessages.map((msg, i) => (
                  <MessageBubble key={`ec-${i}`} role={msg.role} content={msg.content} />
                ))}
              </div>
            )}

            {isLoading && messages[messages.length - 1]?.content === "" && (
              <div className="flex gap-1 px-8 py-2">
                <span className="w-2 h-2 rounded-full animate-bounce opacity-60" style={{ background: "var(--extra-credit-accent)" }} />
                <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.1s] opacity-60" style={{ background: "var(--extra-credit-accent)" }} />
                <span className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] opacity-60" style={{ background: "var(--extra-credit-accent)" }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </>
      ) : (
        /* Pre-mastery: single scrollable area with all messages */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {displayMessages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))}
          {isLoading && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-1 px-4 py-2">
              <span className="w-2 h-2 bg-[var(--neon-cyan)] rounded-full animate-bounce opacity-60" />
              <span className="w-2 h-2 bg-[var(--neon-cyan)] rounded-full animate-bounce [animation-delay:0.1s] opacity-60" />
              <span className="w-2 h-2 bg-[var(--neon-cyan)] rounded-full animate-bounce [animation-delay:0.2s] opacity-60" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t p-4 transition-all duration-700"
        style={isExtraCredit
          ? { background: "var(--extra-credit-surface)", borderColor: "var(--extra-credit-border)" }
          : { background: "var(--surface)", borderColor: "var(--border-retro)" }
        }
      >
        {isExtraCredit && !input && (
          <div className="text-[10px] font-[family-name:var(--font-share-tech-mono)] mb-2 transition-opacity duration-500" style={{ color: "var(--extra-credit-accent)", opacity: 0.4 }}>
            Extra Credit mode engaged!
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExtraCredit ? "Ask anything about the topic..." : "Type your answer..."}
            rows={2}
            className="flex-1 border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm resize-none focus:outline-none font-[family-name:var(--font-geist-mono)] transition-all duration-700"
            style={isExtraCredit
              ? { background: "var(--extra-credit-surface-light)", borderColor: "var(--extra-credit-border)" }
              : { background: "var(--surface-light)", borderColor: "var(--border-retro)" }
            }
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`px-4 rounded-lg text-sm font-medium font-[family-name:var(--font-share-tech-mono)] disabled:opacity-30 disabled:cursor-not-allowed self-end transition-all duration-700 ${isExtraCredit ? "" : "btn-neon hover:bg-[var(--neon-cyan)]/10"}`}
            style={isExtraCredit
              ? { color: "var(--extra-credit-accent)", border: "1px solid var(--extra-credit-border)" }
              : undefined
            }
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
