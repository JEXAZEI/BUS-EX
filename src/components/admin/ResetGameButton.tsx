"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetGameButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to reset game");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="btn-danger">
        Reset game for new term
      </button>
    );
  }

  return (
    <div className="alert-danger p-3">
      <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">
        This wipes all trades, holdings, price history, and events, and resets every
        student&apos;s cash balance. This cannot be undone. Are you sure?
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={reset} className="btn-danger" disabled={loading}>
          {loading ? "Resetting..." : "Yes, reset everything"}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-secondary" disabled={loading}>
          Cancel
        </button>
      </div>
    </div>
  );
}
