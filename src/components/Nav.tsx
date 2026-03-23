"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session) return null;

  return (
    <nav className="bg-[var(--surface)] border-b border-[var(--border-retro)]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="font-[family-name:var(--font-share-tech-mono)] text-[var(--neon-cyan)] font-bold text-lg glow-cyan tracking-widest"
        >
          MEMORY<span className="text-[var(--neon-magenta)]">.</span>dump
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-[var(--neon-green)] hover:text-white text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
          >
            Subjects
          </Link>
          <Link
            href="/import"
            className="text-[var(--neon-purple)] hover:text-white text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
          >
            Import
          </Link>
          {session.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
            <Link
              href="/admin"
              className="text-[var(--neon-magenta)] hover:text-white text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
            >
              Admin
            </Link>
          )}

          <Link
            href="/settings"
            className="text-[var(--foreground)]/40 hover:text-white text-sm font-[family-name:var(--font-share-tech-mono)] transition-colors"
          >
            Settings
          </Link>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="User menu"
              className="w-8 h-8 rounded-full overflow-hidden border-2 border-[var(--border-retro)] hover:border-[var(--neon-cyan)] transition-colors"
            >
              {session.user?.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--surface-light)] flex items-center justify-center text-[var(--neon-cyan)] text-xs font-[family-name:var(--font-share-tech-mono)]">
                  {session.user?.name?.[0] ?? "?"}
                </div>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg shadow-lg py-1 min-w-[140px] z-50 box-glow-cyan">
                <div className="px-3 py-2 text-xs text-[var(--foreground)] opacity-50 border-b border-[var(--border-retro)] font-[family-name:var(--font-share-tech-mono)]">
                  {session.user?.email}
                </div>
                <button
                  onClick={() => signOut()}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--neon-magenta)] hover:bg-[var(--surface-light)] font-[family-name:var(--font-share-tech-mono)]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
