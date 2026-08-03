"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketRegime } from "@/lib/services/regime";

// Pre-fills a sensible duration when the dropdown changes, matching the
// midpoint of that regime's normal random range (regime.ts,
// REGIME_DURATION_MINUTES) -- the teacher can still override it.
const DEFAULT_HOURS: Record<MarketRegime, number> = { bull: 17, neutral: 10, bear: 7 };

export function SetRegimeForm({ current }: { current: MarketRegime }) {
  const router = useRouter();
  const [regime, setRegimeValue] = useState<MarketRegime>(current);
  const [hours, setHours] = useState(String(DEFAULT_HOURS[current]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const durationHours = parseFloat(hours);
    if (!durationHours || durationHours <= 0) {
      setError("Enter a positive number of hours");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/regime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regime, durationHours }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to change the cycle");
        return;
      }
      setMessage("Cycle updated.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-700"
    >
      <div>
        <label className="label" htmlFor="regime-select">
          Set cycle
        </label>
        <select
          id="regime-select"
          className="input"
          value={regime}
          onChange={(e) => {
            const next = e.target.value as MarketRegime;
            setRegimeValue(next);
            setHours(String(DEFAULT_HOURS[next]));
          }}
        >
          <option value="bull">Bull</option>
          <option value="bear">Bear</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="regime-hours">
          Duration (hours)
        </label>
        <input
          id="regime-hours"
          className="input w-24"
          type="number"
          min="1"
          max="240"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Applying..." : "Apply"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {message && <p className="w-full text-sm delta-up">{message}</p>}
    </form>
  );
}
