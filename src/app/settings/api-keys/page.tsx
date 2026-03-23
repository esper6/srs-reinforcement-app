import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ApiKeysForm from "@/components/ApiKeysForm";

export default async function ApiKeysPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      preferredProvider: true,
      apiKeys: {
        select: { provider: true },
      },
    },
  });

  const savedProviders = user.apiKeys.map(
    (k: { provider: string }) => k.provider
  );

  return (
    <ApiKeysForm
      savedProviders={savedProviders}
      preferredProvider={user.preferredProvider}
    />
  );
}
