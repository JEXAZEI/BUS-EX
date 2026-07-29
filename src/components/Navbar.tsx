"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/lib/supabase/types";

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
    <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="text-lg font-extrabold text-brand-700">
          BUS-EX
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === l.href || pathname.startsWith(l.href + "/")
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2 text-sm text-gray-400">@{username}</span>
          <button onClick={logout} className="btn-secondary ml-2">
            Log out
          </button>
        </div>

        <button
          className="sm:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-3 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === l.href ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <span className="px-3 py-1 text-sm text-gray-400">@{username}</span>
          <button onClick={logout} className="btn-secondary mx-3 mt-1">
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
