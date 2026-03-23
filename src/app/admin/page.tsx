import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, ADMIN_EMAIL } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdminUserList from "@/components/AdminUserList";

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
        User Management
      </h1>
      <AdminUserList users={users} adminEmail={ADMIN_EMAIL} />
    </div>
  );
}
