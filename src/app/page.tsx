"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      if (session.user?.approved === false) {
        router.replace("/pending-approval");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 retro-spinner rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-[family-name:var(--font-share-tech-mono)] text-3xl sm:text-4xl font-bold text-[var(--neon-cyan)] mb-1 glow-cyan animate-flicker tracking-wide">
          MEMORY<span className="text-[var(--neon-magenta)]">.</span>dump
        </h1>
        <div className="h-px w-48 mx-auto bg-gradient-to-r from-transparent via-[var(--neon-cyan)] to-transparent mb-4 opacity-60" />
        <p className="text-[var(--foreground)] opacity-70 mb-8 text-sm leading-relaxed">
          Dump your knowledge. Fight the decay.
          AI-powered spaced repetition for STEM concepts.
        </p>
        <button
          onClick={() => signIn("google")}
          className="btn-neon px-6 py-3 rounded-lg font-medium font-[family-name:var(--font-share-tech-mono)] inline-flex items-center gap-3 animate-pulse-glow"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
