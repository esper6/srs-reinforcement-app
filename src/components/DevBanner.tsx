import { isDevEnv } from "@/lib/appEnv";

export default function DevBanner() {
  if (!isDevEnv()) return null;

  return (
    <div
      role="status"
      aria-label="Development environment"
      className="bg-[var(--neon-magenta)] text-black text-center text-xs font-bold tracking-[0.3em] py-1 font-[family-name:var(--font-share-tech-mono)]"
    >
      ▲ DEV ENVIRONMENT ▲
    </div>
  );
}
