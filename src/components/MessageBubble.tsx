import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  if (!content) return null;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-[var(--neon-cyan)]/10 border border-[var(--neon-cyan)]/20 text-[var(--neon-cyan)] rounded-lg rounded-br-sm px-4 py-2 max-w-[85%] text-sm font-[family-name:var(--font-geist-mono)]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-[var(--surface-light)] border border-[var(--border-retro)] text-[var(--foreground)] rounded-lg rounded-bl-sm px-4 py-3 max-w-[85%] text-sm prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
