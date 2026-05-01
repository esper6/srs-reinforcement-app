// Tag parsers for the round/synthesis engine.
// Streaming is handled by src/lib/llm.ts (multi-provider).

export type RoundOutcome = "advance" | "drop";

export function parseRoundResult(
  text: string
): { name: string; outcome: RoundOutcome } | null {
  // Lazy [\s\S]*? in the name capture so inner double-quotes (e.g. a facet
  // named like `The "Contract" Mental Model`) don't break the match. The
  // trailing `outcome="advance|drop"/>` is a strong enough sentinel.
  const match = text.match(
    /<round_result\s+name="([\s\S]*?)"\s+outcome="(advance|drop)"\s*\/>/
  );
  if (!match) return null;
  return { name: match[1], outcome: match[2] as RoundOutcome };
}

export function stripRoundResultTag(text: string): string {
  return text
    .replace(/<round_result\s+name="[\s\S]*?"\s+outcome="(advance|drop)"\s*\/>/g, "")
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
