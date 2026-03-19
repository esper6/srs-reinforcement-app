import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech-mono",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MEMORY.dump — Fight the Decay",
  description: "AI-powered spaced repetition for STEM learning. Dump your knowledge. Fight the decay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${shareTechMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <Providers>
          <Nav />
          <main className="flex-1 flex flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
