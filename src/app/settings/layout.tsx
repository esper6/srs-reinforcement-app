import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SettingsSidebar from "@/components/SettingsSidebar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending-approval");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 w-full">
      <h1 className="font-[family-name:var(--font-share-tech-mono)] text-2xl font-bold text-[var(--neon-cyan)] mb-6 glow-cyan tracking-wide">
        Settings
      </h1>
      <div className="flex flex-col sm:flex-row gap-6">
        <SettingsSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
