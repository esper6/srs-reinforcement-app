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
