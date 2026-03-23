import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type LlmProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

const MODELS: Record<LlmProvider, string> = {
  ANTHROPIC: "claude-sonnet-4-20250514",
  OPENAI: "gpt-4o",
  GOOGLE: "gemini-2.5-flash",
};

export async function streamChatResponse(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  config: LlmConfig
): Promise<ReadableStream<Uint8Array>> {
  switch (config.provider) {
    case "ANTHROPIC":
      return streamAnthropic(systemPrompt, messages, config.apiKey);
    case "OPENAI":
      return streamOpenAI(systemPrompt, messages, config.apiKey);
    case "GOOGLE":
      return streamGoogle(systemPrompt, messages, config.apiKey);
  }
}

function sseEncode(text: string): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`);
}

const SSE_DONE = new TextEncoder().encode("data: [DONE]\n\n");

// Generic error message — never leak provider details to the client
const CLIENT_ERROR_MSG = "Something went wrong reaching the AI service. Check your API key in Settings.";

function errorStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sseEncode(`[Error: ${CLIENT_ERROR_MSG}]`));
      controller.enqueue(SSE_DONE);
      controller.close();
    },
  });
}

// ─── Anthropic (Claude) ───

async function streamAnthropic(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  apiKey: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: MODELS.ANTHROPIC,
    max_tokens: 1500,
    system: systemPrompt,
    messages,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(sseEncode(event.delta.text));
          }
        }
        controller.enqueue(SSE_DONE);
        controller.close();
      } catch (error) {
        console.error("Anthropic API error:", error);
        controller.enqueue(sseEncode(`[Error: ${CLIENT_ERROR_MSG}]`));
        controller.enqueue(SSE_DONE);
        controller.close();
      }
    },
  });
}

// ─── OpenAI (GPT-4o) ───

async function streamOpenAI(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  apiKey: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new OpenAI({ apiKey });

  try {
    const stream = await client.chat.completions.create({
      model: MODELS.OPENAI,
      max_tokens: 1500,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(sseEncode(text));
            }
          }
          controller.enqueue(SSE_DONE);
          controller.close();
        } catch (error) {
          console.error("OpenAI API error:", error);
          controller.enqueue(sseEncode(`[Error: ${CLIENT_ERROR_MSG}]`));
          controller.enqueue(SSE_DONE);
          controller.close();
        }
      },
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return errorStream();
  }
}

// ─── Google (Gemini) ───

async function streamGoogle(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  apiKey: string
): Promise<ReadableStream<Uint8Array>> {
  const client = new GoogleGenAI({ apiKey });

  // Convert to Gemini format: user/model roles, system instruction separate
  const geminiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }],
  }));

  try {
    const response = await client.models.generateContentStream({
      model: MODELS.GOOGLE,
      config: {
        maxOutputTokens: 1500,
        systemInstruction: systemPrompt,
      },
      contents: geminiMessages,
    });

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(sseEncode(text));
            }
          }
          controller.enqueue(SSE_DONE);
          controller.close();
        } catch (error) {
          console.error("Google API error:", error);
          controller.enqueue(sseEncode(`[Error: ${CLIENT_ERROR_MSG}]`));
          controller.enqueue(SSE_DONE);
          controller.close();
        }
      },
    });
  } catch (error) {
    console.error("Google API error:", error);
    return errorStream();
  }
}
