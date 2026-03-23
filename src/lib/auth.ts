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
