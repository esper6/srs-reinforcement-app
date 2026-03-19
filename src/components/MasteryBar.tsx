interface MasteryBarProps {
  score: number | null;
  size?: "sm" | "md";
}

export default function MasteryBar({ score, size = "sm" }: MasteryBarProps) {
  if (score === null) {
    return (
      <span className="text-[var(--foreground)] opacity-30 text-xs italic font-[family-name:var(--font-share-tech-mono)]">
        Not started
      </span>
    );
  }

  const rounded = Math.round(score);
  const barClass =
    rounded >= 70
      ? "progress-glow-green"
      : rounded >= 40
        ? "progress-glow-yellow"
        : "progress-glow-red";
  const textColor =
    rounded >= 70
      ? "text-[var(--neon-green)]"
      : rounded >= 40
        ? "text-yellow-400"
        : "text-red-400";
  const height = size === "sm" ? "h-1" : "h-2";

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${height} bg-[var(--surface-light)] rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.min(100, rounded)}%` }}
        />
      </div>
      <span className={`text-xs font-medium font-[family-name:var(--font-share-tech-mono)] ${textColor} min-w-[2rem] text-right`}>
        {rounded}%
      </span>
    </div>
  );
}
