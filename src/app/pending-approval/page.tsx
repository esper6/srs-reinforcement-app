"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PendingApprovalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (session?.user?.approved) router.replace("/dashboard");
  }, [session, status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-magenta)] mb-2 glow-magenta tracking-wide">
          ACCESS PENDING
        </h1>
        <div className="h-px w-48 mx-auto bg-gradient-to-r from-transparent via-[var(--neon-magenta)] to-transparent mb-6 opacity-60" />

        <div className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-6 mb-6">
          <p className="text-[var(--foreground)]/70 text-sm leading-relaxed mb-4">
            Your account is awaiting approval. The admin has been notified and will review your access shortly.
          </p>
          <p className="text-[var(--foreground)]/40 text-xs font-mono">
            Signed in as {session.user?.email}
          </p>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="px-5 py-2 bg-[var(--surface)] border border-[var(--neon-magenta)]/40 text-[var(--neon-magenta)] rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-magenta)]/10 hover:border-[var(--neon-magenta)]/60 transition-all duration-200"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
