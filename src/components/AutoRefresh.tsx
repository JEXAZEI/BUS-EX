"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the current page's server-side data fetch (prices,
 * portfolio value, leaderboard rank, etc.) in place, matching the ~20s
 * cadence the ticker tape/news feed already poll at -- without this, pages
 * only ever reflect fresh data on trade/navigation/manual reload. Skips the
 * refresh while the tab is hidden so an idle background tab doesn't keep
 * hitting the server.
 */
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
