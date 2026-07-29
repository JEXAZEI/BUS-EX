"use client";

import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // Avoid rendering the (possibly wrong) icon before we know the real
  // theme on the client, to prevent a flash of the wrong icon.
  if (!mounted) {
    return <div className={`h-9 w-9 ${className}`} aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`btn-secondary !px-0 flex h-9 w-9 items-center justify-center ${className}`}
    >
      {isDark ? "☀️" : "\u{1F319}"}
    </button>
  );
}
