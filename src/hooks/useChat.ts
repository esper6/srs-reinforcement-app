"use client";

// Extra-credit-only chat hook. The rounds-redesign moved scored interactions
// to useRound and useSynthesis; this hook drives the post-round Extra Credit
// surface where the user explores a concept with no scoring pressure.

import { useState, useCallback, useRef } from "react";
import type { ChatMessageData } from "@/lib/types";

interface UseChatOptions {
  conceptId: string;
}

export function useChat({ conceptId }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
        const res = await fetch("/api/chat", {
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
          throw new Error(data.error ?? `Chat request failed (${res.status})`);
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
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      role: "assistant",
                      content: fullText.trim(),
                    };
                    return updated;
                  });
                }
              } catch {
                // skip parse errors
              }
            }
          }
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
    setError(null);
    sessionIdRef.current = null;
  }, []);

  return { messages, isLoading, error, sendMessage, reset };
}
