"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TermRecap } from "@/lib/services/recap";

export function ResetGameButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [recap, setRecap] = useState<TermRecap | null>(null);
  const [loadingRecap, setLoadingRecap] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startConfirm() {
    setConfirming(true);
    setError(null);
    setLoadingRecap(true);
    try {
      const res = await fetch("/api/admin/recap");
      const data = await res.json();
      if (res.ok) setRecap(data.recap);
    } catch {
      // Recap is a nice-to-have -- if it fails to load, the confirm dialog
      // still works fine without it.
    } finally {
      setLoadingRecap(false);
    }
  }

  async function reset() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to reset game");
        return;
      }
      setConfirming(false);
      setRecap(null);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setResetting(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={startConfirm} className="btn-danger">
        Reset game for new term
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {loadingRecap && <p className="text-sm text-gray-400">Loading term recap...</p>}

      {recap && (
        <div className="card bg-gray-50 dark:bg-gray-900/40">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            📊 Term recap
          </h3>
          <ul className="space-y-1.5 text-sm">
            {recap.topTraders.length > 0 && (
              <li>
                <span className="font-medium">Top traders:</span>{" "}
                {recap.topTraders
                  .map((t, i) => `${["🥇", "🥈", "🥉"][i]} ${t.name} ($${t.netWorth.toFixed(2)})`)
                  .join(", ")}
              </li>
            )}
            {recap.mostActive && (
              <li>
                <span className="font-medium">Most active trader:</span> {recap.mostActive.name}{" "}
                ({recap.mostActive.tradeCount} trades)
              </li>
            )}
            {recap.biggestTrade && (
              <li>
                <span className="font-medium">Biggest single trade:</span>{" "}
                {recap.biggestTrade.name} {recap.biggestTrade.side === "buy" ? "bought" : "sold"}{" "}
                {recap.biggestTrade.ticker} for ${recap.biggestTrade.cashAmount.toFixed(2)}
              </li>
            )}
            {recap.topPerformer && (
              <li>
                <span className="font-medium">Top-performing stock:</span> {recap.topPerformer.name} (
                {recap.topPerformer.ticker}) {recap.topPerformer.pctGain >= 0 ? "+" : ""}
                {recap.topPerformer.pctGain.toFixed(1)}%
              </li>
            )}
            {recap.topTraders.length === 0 &&
              !recap.mostActive &&
              !recap.biggestTrade && <li className="text-gray-400">No trading activity this term yet.</li>}
          </ul>
        </div>
      )}

      <div className="alert-danger p-3">
        <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">
          This wipes all trades, holdings, price history, and events, and resets every
          student&apos;s cash balance. This cannot be undone. Are you sure?
        </p>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={reset} className="btn-danger" disabled={resetting}>
            {resetting ? "Resetting..." : "Yes, reset everything"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setRecap(null);
            }}
            className="btn-secondary"
            disabled={resetting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
