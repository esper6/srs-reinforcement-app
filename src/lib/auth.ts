import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Auto-approve admin on every sign-in
      // Use updateMany to avoid throwing if user doesn't exist yet (first sign-in)
      if (user.email === ADMIN_EMAIL) {
        await prisma.user.updateMany({
          where: { email: ADMIN_EMAIL },
          data: { approved: true },
        });

        // First-run default: relay (admin uses enterprise license, no API key needed).
        // Fires only while preferredProvider is still the schema default AND no
        // UserApiKey rows exist — once the admin configures anything, we stop touching it.
        const adminUser = await prisma.user.findUnique({
          where: { email: ADMIN_EMAIL },
          select: {
            id: true,
            preferredProvider: true,
            _count: { select: { apiKeys: true } },
          },
        });
        if (
          adminUser &&
          adminUser.preferredProvider === "ANTHROPIC" &&
          adminUser._count.apiKeys === 0
        ) {
          await prisma.user.update({
            where: { id: adminUser.id },
            data: { preferredProvider: "CLAUDE_RELAY" },
          });
        }
      }
      return true; // Always allow sign-in; approval is checked separately
    },
    session({ session, user }) {
      if (session.user) {
        const dbUser = user as typeof user & { approved?: boolean };
        (session.user as { id?: string; approved?: boolean }).id = user.id;
        (session.user as { id?: string; approved?: boolean }).approved = dbUser.approved ?? false;
      }
      return session;
    },
  },
};
