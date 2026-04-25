import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type LlmProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE" | "CLAUDE_RELAY";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

const MODELS: Record<LlmProvider, string> = {
  ANTHROPIC: "claude-sonnet-4-20250514",
  OPENAI: "gpt-4o",
  GOOGLE: "gemini-2.5-flash",
  CLAUDE_RELAY: "sonnet",
};

const CHEAP_MODELS: Record<LlmProvider, string> = {
  ANTHROPIC: "claude-haiku-4-5-20251001",
  OPENAI: "gpt-4o-mini",
  GOOGLE: "gemini-2.0-flash-lite",
  CLAUDE_RELAY: "haiku",
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
    case "CLAUDE_RELAY":
      return streamRelay(systemPrompt, messages);
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

// ─── Claude Relay (via Claude Code CLI) ───

async function streamRelay(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<ReadableStream<Uint8Array>> {
  const relayUrl = process.env.CLAUDE_RELAY_URL;
  const relaySecret = process.env.CLAUDE_RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    console.error("CLAUDE_RELAY_URL or CLAUDE_RELAY_SECRET not configured");
    return errorStream();
  }

  try {
    const res = await fetch(`${relayUrl}/api/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${relaySecret}`,
      },
      body: JSON.stringify({ systemPrompt, messages, model: "sonnet" }),
    });

    if (!res.ok || !res.body) {
      console.error("Relay stream error:", res.status, res.statusText);
      return errorStream();
    }

    return res.body as ReadableStream<Uint8Array>;
  } catch (error) {
    console.error("Relay connection error:", error);
    return errorStream();
  }
}

async function singleRelay(
  systemPrompt: string,
  userMessage: string,
  useCheapModel: boolean
): Promise<string> {
  const relayUrl = process.env.CLAUDE_RELAY_URL;
  const relaySecret = process.env.CLAUDE_RELAY_SECRET;

  if (!relayUrl || !relaySecret) {
    throw new Error("CLAUDE_RELAY_URL or CLAUDE_RELAY_SECRET not configured");
  }

  const res = await fetch(`${relayUrl}/api/single`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${relaySecret}`,
    },
    body: JSON.stringify({
      systemPrompt,
      userMessage,
      model: useCheapModel ? "haiku" : "sonnet",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`Relay error (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.text ?? "";
}

// ─── Non-streaming single response (for grading, etc.) ───

export async function singleChatResponse(
  systemPrompt: string,
  userMessage: string,
  config: LlmConfig,
  useCheapModel: boolean = false,
  maxTokens: number = 300
): Promise<string> {
  if (config.provider === "CLAUDE_RELAY") {
    return singleRelay(systemPrompt, userMessage, useCheapModel);
  }
  const model = useCheapModel ? CHEAP_MODELS[config.provider] : MODELS[config.provider];
  switch (config.provider) {
    case "ANTHROPIC": {
      const client = new Anthropic({ apiKey: config.apiKey });
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      const block = res.content[0];
      return block.type === "text" ? block.text : "";
    }
    case "OPENAI": {
      const client = new OpenAI({ apiKey: config.apiKey });
      const res = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    }
    case "GOOGLE": {
      const client = new GoogleGenAI({ apiKey: config.apiKey });
      const res = await client.models.generateContent({
        model,
        config: { maxOutputTokens: maxTokens, systemInstruction: systemPrompt },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      });
      return res.text ?? "";
    }
  }
}
