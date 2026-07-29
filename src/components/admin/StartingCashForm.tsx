"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartingCashForm({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const amount = parseFloat(value);
    if (!amount || amount <= 0) {
      setError("Enter a positive amount");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCash: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div>
        <label className="label" htmlFor="startingCash">
          Default starting cash for new students
        </label>
        <input
          id="startingCash"
          className="input"
          type="number"
          min="1"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>
      {saved && <span className="text-sm text-up">Saved</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
