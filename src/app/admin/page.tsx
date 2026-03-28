import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdminUserList from "@/components/AdminUserList";
import Link from "next/link";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (session.user.email !== ADMIN_EMAIL) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { id: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      approved: true,
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-purple)] mb-6 glow-purple tracking-wide">
        Admin
      </h1>

      <div className="mb-8">
        <Link
          href="/admin/generate-vocab"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--surface)] border border-[var(--border-retro)] rounded-lg font-[family-name:var(--font-share-tech-mono)] text-sm text-[var(--neon-cyan)] hover:border-[var(--neon-cyan)]/30 hover:bg-[var(--neon-cyan)]/5 transition-all duration-200"
        >
          Generate Vocab
          <span className="text-[var(--foreground)]/30">&rarr;</span>
        </Link>
      </div>

      <h2 className="font-[family-name:var(--font-share-tech-mono)] text-lg text-[var(--neon-purple)] mb-4 glow-purple">
        Users
      </h2>
      <AdminUserList users={users} adminEmail={ADMIN_EMAIL} />
    </div>
  );
}
