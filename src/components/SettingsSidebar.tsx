"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SETTINGS_LINKS = [
  { href: "/settings/api-keys", label: "API Keys" },
];

export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="sm:w-44 flex-shrink-0">
      <ul className="flex sm:flex-col gap-1">
        {SETTINGS_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block px-3 py-2 rounded-lg text-sm font-[family-name:var(--font-share-tech-mono)] transition-all duration-200 ${
                  active
                    ? "bg-[var(--neon-cyan)]/10 text-[var(--neon-cyan)] border border-[var(--neon-cyan)]/30"
                    : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]/80 hover:bg-[var(--surface)] border border-transparent"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
