"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessageData } from "@/lib/types";
import type { SynthesisOutcome } from "@/lib/claude";

export interface SynthesisResult {
  outcome: SynthesisOutcome;
}

interface UseSynthesisOptions {
  conceptId: string;
}

const ROUND_TAG_RX = /<round_result\s+name="[^"]+"\s+outcome="(advance|drop)"\s*\/>/g;
const SYNTHESIS_TAG_RX = /<synthesis_result\s+outcome="(pass|fail)"\s*\/>/g;

function stripTagsForDisplay(text: string): string {
  return text.replace(ROUND_TAG_RX, "").replace(SYNTHESIS_TAG_RX, "").trim();
}

export function useSynthesis({ conceptId }: UseSynthesisOptions) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      setIsLoading(true);
      setError(null);

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/synthesis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptId,
            sessionId: sessionIdRef.current,
            userMessage,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Synthesis request failed (${res.status})`);
        }

        const newSessionId = res.headers.get("X-Session-Id");
        if (newSessionId) sessionIdRef.current = newSessionId;

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Response had no readable body");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  fullText += data.text;
                  const displayText = stripTagsForDisplay(fullText);
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: displayText };
                    return updated;
                  });
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }

        // Parse but don't auto-transition — component shows a Continue button.
        const match = fullText.match(/<synthesis_result\s+outcome="(pass|fail)"\s*\/>/);
        if (match) {
          setSynthesisResult({ outcome: match[1] as SynthesisOutcome });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `⚠ ${message}`,
          };
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [conceptId]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setSynthesisResult(null);
    setError(null);
    sessionIdRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    synthesisResult,
    error,
    sendMessage,
    reset,
  };
}
