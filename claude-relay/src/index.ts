import express, { Request, Response, NextFunction } from "express";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "1mb" }));

const RELAY_SECRET = process.env.RELAY_SECRET;
if (!RELAY_SECRET) {
  console.error("RELAY_SECRET env var is required");
  process.exit(1);
}

function auth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== RELAY_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function formatConversation(
  messages: { role: string; content: string }[]
): string {
  if (messages.length <= 1) return messages[0]?.content ?? "";

  const transcript = messages
    .map((m) => {
      const label = m.role === "user" ? "Student" : "Tutor";
      return `[${label}]: ${m.content}`;
    })
    .join("\n\n");

  return `Here is the conversation so far:\n\n${transcript}\n\nProvide your next response as the Tutor. Do not include any role labels or prefixes in your response.`;
}

function buildClaudeArgs(
  systemPrompt: string,
  model: string
): string[] {
  return [
    "--print",
    "--no-session-persistence",
    "--tools",
    "",
    "--system-prompt",
    systemPrompt,
    "--model",
    model,
  ];
}

// ─── Streaming endpoint (for chat) ───

app.post("/api/stream", auth, (req: Request, res: Response) => {
  const {
    systemPrompt,
    messages,
    model = "sonnet",
  } = req.body as {
    systemPrompt: string;
    messages: { role: string; content: string }[];
    model?: string;
  };

  if (!systemPrompt || !messages?.length) {
    res.status(400).json({ error: "Missing systemPrompt or messages" });
    return;
  }

  const prompt = formatConversation(messages);
  const args = buildClaudeArgs(systemPrompt, model);

  const child = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(prompt);
  child.stdin.end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    console.error("claude stderr:", chunk.toString());
  });

  child.on("close", (code) => {
    if (code !== 0) {
      res.write(
        `data: ${JSON.stringify({ text: `\n\n[Error: Claude CLI exited with code ${code}]` })}\n\n`
      );
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });

  child.on("error", (err) => {
    console.error("Failed to spawn claude:", err.message);
    res.write(
      `data: ${JSON.stringify({ text: "[Error: Failed to start Claude CLI]" })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
  });

  req.on("close", () => {
    if (!child.killed) child.kill();
  });
});

// ─── Single-shot endpoint (for vocab grading, generation) ───

app.post("/api/single", auth, (req: Request, res: Response) => {
  const {
    systemPrompt,
    userMessage,
    model = "sonnet",
  } = req.body as {
    systemPrompt: string;
    userMessage: string;
    model?: string;
  };

  if (!systemPrompt || !userMessage) {
    res.status(400).json({ error: "Missing systemPrompt or userMessage" });
    return;
  }

  const args = buildClaudeArgs(systemPrompt, model);

  const child = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(userMessage);
  child.stdin.end();

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error("claude stderr:", stderr);
      res.status(502).json({ error: "Claude CLI error", details: stderr });
      return;
    }
    res.json({ text: stdout });
  });

  child.on("error", (err) => {
    console.error("Failed to spawn claude:", err.message);
    res.status(502).json({ error: "Failed to start Claude CLI" });
  });
});

// ─── Health check ───

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Claude relay listening on :${PORT}`);
});
