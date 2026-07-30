"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar({ username, role }: { username: string; role: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: "Market" },
    { href: "/profile", label: "Profile" },
    ...(role === "teacher" || role === "owner" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-ink-900/95">
      <div className="h-0.5 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600" />
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-1.5 font-mono text-lg font-black tracking-tight">
          <span className="text-gray-900 dark:text-white">BUS</span>
          <span className="text-brand-500">·</span>
          <span className="text-brand-600 dark:text-brand-400">EX</span>
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-2 text-sm font-semibold tracking-tight ${
                pathname === l.href || pathname.startsWith(l.href + "/")
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2 font-mono text-sm text-gray-400">@{username}</span>
          <ThemeToggle className="ml-2" />
          <button onClick={logout} className="btn-secondary ml-2">
            Log out
          </button>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-700 dark:text-gray-200">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2 text-sm font-semibold tracking-tight ${
                pathname === l.href
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <span className="px-3 py-1 font-mono text-sm text-gray-400">@{username}</span>
          <button onClick={logout} className="btn-secondary mx-3 mt-1">
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
