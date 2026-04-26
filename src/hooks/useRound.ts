"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessageData } from "@/lib/types";
import type { RoundOutcome } from "@/lib/claude";

export interface RoundResult {
  name: string;
  outcome: RoundOutcome;
}

interface UseRoundOptions {
  conceptId: string;
  // Caller-chosen facet to send on the first /api/round call. The server
  // validates it (must be in concept.facets and currently due) and uses it
  // instead of running its own pickWeakestOverdue. Subsequent in-session
  // calls use whatever facet the server confirmed via X-Facet-Name header.
  initialFacetName?: string;
}

// Strip the round/synthesis tags from the streaming display text. Tags are
// emitted at the very end of Claude's final message; we accumulate them in
// fullText for parsing but never render them in the chat bubble.
const ROUND_TAG_RX = /<round_result\s+name="[^"]+"\s+outcome="(advance|drop)"\s*\/>/g;
const SYNTHESIS_TAG_RX = /<synthesis_result\s+outcome="(pass|fail)"\s*\/>/g;

function stripTagsForDisplay(text: string): string {
  return text.replace(ROUND_TAG_RX, "").replace(SYNTHESIS_TAG_RX, "").trim();
}

export function useRound({ conceptId, initialFacetName }: UseRoundOptions) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [facetName, setFacetName] = useState<string | null>(initialFacetName ?? null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const facetNameRef = useRef<string | null>(initialFacetName ?? null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      setIsLoading(true);
      setError(null);

      // Add user message + empty assistant placeholder we'll stream into
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/round", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptId,
            sessionId: sessionIdRef.current,
            facetName: facetNameRef.current,
            userMessage,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Round request failed (${res.status})`);
        }

        // Capture session + facet from headers on first response
        const newSessionId = res.headers.get("X-Session-Id");
        if (newSessionId) sessionIdRef.current = newSessionId;
        const newFacetName = res.headers.get("X-Facet-Name");
        if (newFacetName) {
          facetNameRef.current = newFacetName;
          setFacetName(newFacetName);
        }

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
                // skip parse errors; partial chunks happen
              }
            }
          }
        }

        // After stream ends, parse the round_result tag (if Claude resolved this turn).
        // We set state but do NOT auto-transition — the component shows a Continue
        // button so the user can read Claude's final message before moving on.
        const match = fullText.match(
          /<round_result\s+name="([^"]+)"\s+outcome="(advance|drop)"\s*\/>/
        );
        if (match) {
          setRoundResult({
            name: match[1],
            outcome: match[2] as RoundOutcome,
          });
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
    setFacetName(null);
    setRoundResult(null);
    setError(null);
    sessionIdRef.current = null;
    facetNameRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    facetName,
    roundResult,
    error,
    sendMessage,
    reset,
  };
}
