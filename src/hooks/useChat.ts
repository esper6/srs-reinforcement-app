"use client";

import { useState, useCallback, useRef } from "react";
import { ChatMessageData, SubMasteryData } from "@/lib/types";

interface UseChatOptions {
  conceptId: string;
  mode: "ASSESS" | "LEARN" | "REVIEW";
  onMasteryUpdate?: (score: number, decayRate: number, subMasteries?: SubMasteryData[]) => void;
}

export function useChat({ conceptId, mode, onMasteryUpdate }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtraCredit, setIsExtraCredit] = useState(false);
  const [masteryResult, setMasteryResult] = useState<{ score: number; subMasteries: SubMasteryData[]; messageCount: number } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const extraCreditRef = useRef(false);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      setIsLoading(true);

      // Add user message immediately
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptId,
            mode,
            sessionId: sessionIdRef.current,
            userMessage,
            extraCredit: extraCreditRef.current,
          }),
        });

        if (!res.ok) {
          throw new Error("Chat request failed");
        }

        // Get session ID from response header if available
        const newSessionId = res.headers.get("X-Session-Id");
        if (newSessionId) {
          sessionIdRef.current = newSessionId;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  fullText += data.text;
                  // Strip mastery and sub-mastery tags for display
                  const displayText = fullText
                    .replace(/<mastery\s+score="\d+"\s+decay_rate="[\d.]+"\s*\/>/g, "")
                    .replace(/<sub_mastery\s+name="[^"]+"\s+score="\d+"\s+decay_rate="[\d.]+"\s*\/>/g, "");
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      role: "assistant",
                      content: displayText.trim(),
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

        // Check for sub-mastery tags first, then fall back to legacy mastery tag
        const subMasteryRegex = /<sub_mastery\s+name="([^"]+)"\s+score="(\d+)"\s+decay_rate="([\d.]+)"\s*\/>/g;
        const subMasteries: SubMasteryData[] = [];
        let subMatch;
        while ((subMatch = subMasteryRegex.exec(fullText)) !== null) {
          subMasteries.push({
            name: subMatch[1],
            score: parseInt(subMatch[2]),
            decayRate: parseFloat(subMatch[3]),
          });
        }

        if (subMasteries.length > 0 && onMasteryUpdate) {
          const overallScore = Math.round(
            subMasteries.reduce((sum, s) => sum + s.score, 0) / subMasteries.length
          );
          const overallDecay =
            subMasteries.reduce((sum, s) => sum + s.decayRate, 0) / subMasteries.length;
          onMasteryUpdate(overallScore, overallDecay, subMasteries);
          // Capture how many messages exist at scoring time (used to split assessment vs extra credit in UI)
          setMessages((prev) => {
            setMasteryResult({ score: overallScore, subMasteries, messageCount: prev.length });
            return prev;
          });
          // Enter extra credit mode after scores are emitted
          extraCreditRef.current = true;
          setIsExtraCredit(true);
        } else if (!extraCreditRef.current) {
          // Legacy fallback (only if not already in extra credit)
          const masteryMatch = fullText.match(
            /<mastery\s+score="(\d+)"\s+decay_rate="([\d.]+)"\s*\/>/
          );
          if (masteryMatch && onMasteryUpdate) {
            const legacyScore = parseInt(masteryMatch[1]);
            onMasteryUpdate(legacyScore, parseFloat(masteryMatch[2]));
            setMessages((prev) => {
              setMasteryResult({ score: legacyScore, subMasteries: [], messageCount: prev.length });
              return prev;
            });
            extraCreditRef.current = true;
            setIsExtraCredit(true);
          }
        }
      } catch (error) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          };
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [conceptId, mode, onMasteryUpdate]
  );

  const reset = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = null;
  }, []);

  return { messages, isLoading, isExtraCredit, masteryResult, sendMessage, reset };
}
