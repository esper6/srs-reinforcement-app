"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PROVIDERS = [
  {
    id: "ANTHROPIC" as const,
    name: "Anthropic",
    label: "Claude",
    placeholder: "sk-ant-...",
    color: "var(--neon-cyan)",
  },
  {
    id: "OPENAI" as const,
    name: "OpenAI",
    label: "GPT-4o",
    placeholder: "sk-...",
    color: "var(--neon-green)",
  },
  {
    id: "GOOGLE" as const,
    name: "Google",
    label: "Gemini",
    placeholder: "AIza...",
    color: "var(--neon-purple)",
  },
];

export default function ApiKeysForm({
  savedProviders,
  preferredProvider,
  relayConfigured = false,
}: {
  savedProviders: string[];
  preferredProvider: string;
  relayConfigured?: boolean;
}) {
  const router = useRouter();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [preferred, setPreferred] = useState(preferredProvider);
  const [saving, setSaving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function flashMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleSaveKey(provider: string) {
    const key = keys[provider]?.trim();
    if (!key) return;

    setSaving(provider);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      if (res.ok) {
        setKeys((prev) => ({ ...prev, [provider]: "" }));
        flashMessage("success", `${provider} key saved`);
        router.refresh();
      } else {
        const data = await res.json();
        flashMessage("error", data.error || "Failed to save");
      }
    } finally {
      setSaving(null);
    }
  }

  async function handleRemoveKey(provider: string) {
    setRemoving(provider);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        flashMessage("success", `${provider} key removed`);
        router.refresh();
      }
    } finally {
      setRemoving(null);
    }
  }

  async function handleSetPreferred(provider: string) {
    setPreferred(provider);
    await fetch("/api/settings/api-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    router.refresh();
  }

  return (
    <div>
      <p className="text-[var(--foreground)]/50 text-sm mb-5">
        Add your API key for at least one provider. Keys are encrypted at rest.
      </p>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-[var(--neon-green)]/10 border-[var(--neon-green)]/30 text-[var(--neon-green)]"
              : "bg-red-900/30 border-red-500/40 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((p) => {
          const hasSaved = savedProviders.includes(p.id);
          const isPreferred = preferred === p.id;

          return (
            <div
              key={p.id}
              className={`bg-[var(--surface)] border rounded-lg p-4 transition-all duration-200 ${
                isPreferred && hasSaved
                  ? `border-[${p.color}]/40`
                  : "border-[var(--border-retro)]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="font-[family-name:var(--font-share-tech-mono)] text-sm"
                    style={{ color: p.color }}
                  >
                    {p.name}
                  </span>
                  <span className="text-[var(--foreground)]/30 text-xs">
                    {p.label}
                  </span>
                  {hasSaved && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)]/70 font-[family-name:var(--font-share-tech-mono)]">
                      saved
                    </span>
                  )}
                </div>
                {hasSaved && (
                  <button
                    onClick={() => handleSetPreferred(p.id)}
                    className={`text-xs font-[family-name:var(--font-share-tech-mono)] px-2 py-1 rounded transition-all duration-200 ${
                      isPreferred
                        ? "bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30"
                        : "text-[var(--foreground)]/30 hover:text-[var(--foreground)]/60 border border-transparent hover:border-[var(--border-retro)]"
                    }`}
                  >
                    {isPreferred ? "active" : "set active"}
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={keys[p.id] ?? ""}
                  onChange={(e) =>
                    setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  placeholder={hasSaved ? "••••••••  (replace key)" : p.placeholder}
                  className="flex-1 bg-[var(--background)] border border-[var(--border-retro)] rounded px-3 py-1.5 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--foreground)]/20 focus:outline-none focus:border-[var(--neon-cyan)]/40"
                />
                <button
                  onClick={() => handleSaveKey(p.id)}
                  disabled={!keys[p.id]?.trim() || saving === p.id}
                  className="px-3 py-1.5 bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/30 text-[var(--neon-cyan)] rounded text-sm font-[family-name:var(--font-share-tech-mono)] hover:bg-[var(--neon-cyan)]/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {saving === p.id ? "..." : "Save"}
                </button>
                {hasSaved && (
                  <button
                    onClick={() => handleRemoveKey(p.id)}
                    disabled={removing === p.id}
                    className="px-3 py-1.5 border border-red-500/30 text-red-400/70 rounded text-sm font-[family-name:var(--font-share-tech-mono)] hover:bg-red-900/20 hover:border-red-500/50 transition-all duration-200 disabled:opacity-30"
                  >
                    {removing === p.id ? "..." : "Remove"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Claude Relay — no API key needed */}
        <div
          className={`bg-[var(--surface)] border rounded-lg p-4 transition-all duration-200 ${
            preferred === "CLAUDE_RELAY"
              ? "border-[var(--neon-magenta)]/40"
              : "border-[var(--border-retro)]"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="font-[family-name:var(--font-share-tech-mono)] text-sm"
                style={{ color: "var(--neon-magenta)" }}
              >
                Claude Relay
              </span>
              <span className="text-[var(--foreground)]/30 text-xs">
                Claude Code CLI
              </span>
              {relayConfigured && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--neon-green)]/10 text-[var(--neon-green)]/70 font-[family-name:var(--font-share-tech-mono)]">
                  configured
                </span>
              )}
            </div>
            {relayConfigured && (
              <button
                onClick={() => handleSetPreferred("CLAUDE_RELAY")}
                className={`text-xs font-[family-name:var(--font-share-tech-mono)] px-2 py-1 rounded transition-all duration-200 ${
                  preferred === "CLAUDE_RELAY"
                    ? "bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30"
                    : "text-[var(--foreground)]/30 hover:text-[var(--foreground)]/60 border border-transparent hover:border-[var(--border-retro)]"
                }`}
              >
                {preferred === "CLAUDE_RELAY" ? "active" : "set active"}
              </button>
            )}
          </div>

          <p className="text-[var(--foreground)]/40 text-xs">
            {relayConfigured
              ? "Routes requests through a Claude Code relay server. No API key needed."
              : "Not configured. Set CLAUDE_RELAY_URL and CLAUDE_RELAY_SECRET env vars to enable."}
          </p>
        </div>
      </div>
    </div>
  );
}
