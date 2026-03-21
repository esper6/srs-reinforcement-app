import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  warm?: boolean;
}

export default function MessageBubble({ role, content, warm }: MessageBubbleProps) {
  if (!content) return null;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="rounded-lg rounded-br-sm px-4 py-2 max-w-[85%] text-sm font-[family-name:var(--font-geist-mono)] transition-colors duration-500"
          style={warm
            ? { background: "var(--extra-credit-user-bg)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--extra-credit-user-border)", color: "var(--extra-credit-accent)" }
            : { background: "rgba(0, 240, 255, 0.1)", borderWidth: 1, borderStyle: "solid", borderColor: "rgba(0, 240, 255, 0.2)", color: "var(--neon-cyan)" }
          }
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="rounded-lg rounded-bl-sm px-4 py-3 max-w-[85%] text-sm prose prose-invert prose-sm max-w-none transition-colors duration-500"
        style={warm
          ? { background: "var(--extra-credit-assistant-bg)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--extra-credit-assistant-border)", color: "var(--extra-credit-text)" }
          : { background: "var(--surface-light)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-retro)", color: "var(--foreground)" }
        }
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
