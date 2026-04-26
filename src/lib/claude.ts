// Tag parsers for mastery scores emitted by the LLM.
// Streaming is handled by src/lib/llm.ts (multi-provider).

export function parseMasteryTag(
  text: string
): { score: number; decayRate: number } | null {
  const match = text.match(
    /<mastery\s+score="(\d+)"\s+decay_rate="([\d.]+)"\s*\/>/
  );
  if (!match) return null;
  return { score: parseInt(match[1]), decayRate: parseFloat(match[2]) };
}

export function stripMasteryTag(text: string): string {
  return text.replace(/<mastery\s+score="\d+"\s+decay_rate="[\d.]+"\s*\/>/g, "").trim();
}

export function parseSubMasteryTags(
  text: string
): { name: string; score: number; decayRate: number }[] {
  const results: { name: string; score: number; decayRate: number }[] = [];
  const regex = /<sub_mastery\s+name="([^"]+)"\s+score="(\d+)"\s+decay_rate="([\d.]+)"\s*\/>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      name: match[1],
      score: parseInt(match[2]),
      decayRate: parseFloat(match[3]),
    });
  }
  return results;
}

export function stripSubMasteryTags(text: string): string {
  return text.replace(/<sub_mastery\s+name="[^"]+"\s+score="\d+"\s+decay_rate="[\d.]+"\s*\/>/g, "").trim();
}

// ─── Rounds redesign tag parsers ───
// One <round_result> per round; one <synthesis_result> per synthesis attempt.
// Outcome unions are strictly matched in the regex — an unrecognized outcome
// surfaces as `null` rather than being silently miscategorized.

export type RoundOutcome = "advance" | "drop";

export function parseRoundResult(
  text: string
): { name: string; outcome: RoundOutcome } | null {
  const match = text.match(
    /<round_result\s+name="([^"]+)"\s+outcome="(advance|drop)"\s*\/>/
  );
  if (!match) return null;
  return { name: match[1], outcome: match[2] as RoundOutcome };
}

export function stripRoundResultTag(text: string): string {
  return text
    .replace(/<round_result\s+name="[^"]+"\s+outcome="(advance|drop)"\s*\/>/g, "")
    .trim();
}

export type SynthesisOutcome = "pass" | "fail";

export function parseSynthesisResult(
  text: string
): { outcome: SynthesisOutcome } | null {
  const match = text.match(/<synthesis_result\s+outcome="(pass|fail)"\s*\/>/);
  if (!match) return null;
  return { outcome: match[1] as SynthesisOutcome };
}

export function stripSynthesisResultTag(text: string): string {
  return text.replace(/<synthesis_result\s+outcome="(pass|fail)"\s*\/>/g, "").trim();
}
