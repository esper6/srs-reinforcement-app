import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function streamChatResponse(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<ReadableStream<Uint8Array>> {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("Claude API error:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ text: `[Error: ${errorMsg}]` })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}

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
