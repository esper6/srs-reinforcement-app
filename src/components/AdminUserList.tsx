"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  approved: boolean;
}

export default function AdminUserList({
  users: initialUsers,
  adminEmail,
}: {
  users: UserRow[];
  adminEmail: string;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState<string | null>(null);

  async function handleApprove(userId: string) {
    setApproving(userId);
    try {
      const res = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setApproving(null);
    }
  }

  const pending = initialUsers.filter((u) => !u.approved);
  const approved = initialUsers.filter((u) => u.approved);

  return (
    <div className="space-y-8">
      {/* Pending users */}
      {pending.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--neon-magenta)] mb-3 tracking-wide uppercase">
            Pending Approval ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((user) => (
              <div
                key={user.id}
                className="bg-[var(--surface)] border border-[var(--neon-magenta)]/20 rounded-lg p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt=""
                      className="w-8 h-8 rounded-full border border-[var(--border-retro)] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-light)] border border-[var(--border-retro)] flex items-center justify-center text-[var(--foreground)]/40 text-xs font-[family-name:var(--font-share-tech-mono)] flex-shrink-0">
                      {user.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--foreground)]/90 truncate">
                      {user.name ?? "Unknown"}
                    </div>
                    <div className="text-xs text-[var(--foreground)]/40 font-mono truncate">
                      {user.email}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleApprove(user.id)}
                  disabled={approving === user.id}
                  className="flex-shrink-0 px-4 py-1.5 bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/40 text-[var(--neon-green)] rounded font-[family-name:var(--font-share-tech-mono)] text-sm hover:bg-[var(--neon-green)]/20 hover:border-[var(--neon-green)]/60 transition-all duration-200 disabled:opacity-50"
                >
                  {approving === user.id ? "..." : "Approve"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved users */}
      <div>
        <h2 className="font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--neon-green)] mb-3 tracking-wide uppercase">
          Approved ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="text-[var(--foreground)]/30 text-sm">No approved users yet.</p>
        ) : (
          <div className="space-y-2">
            {approved.map((user) => (
              <div
                key={user.id}
                className="bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg p-4 flex items-center gap-3"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="w-8 h-8 rounded-full border border-[var(--border-retro)] flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-light)] border border-[var(--border-retro)] flex items-center justify-center text-[var(--foreground)]/40 text-xs font-[family-name:var(--font-share-tech-mono)] flex-shrink-0">
                    {user.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-[var(--foreground)]/90 truncate">
                    {user.name ?? "Unknown"}
                    {user.email === adminEmail && (
                      <span className="ml-2 text-xs text-[var(--neon-cyan)]/60 font-[family-name:var(--font-share-tech-mono)]">
                        admin
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--foreground)]/40 font-mono truncate">
                    {user.email}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
