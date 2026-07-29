"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/supabase/types";

export function CompanyForm({ company, onDone }: { company?: Company; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(company?.name ?? "");
  const [ticker, setTicker] = useState(company?.ticker ?? "");
  const [description, setDescription] = useState(company?.description ?? "");
  const [sector, setSector] = useState(company?.sector ?? "general");
  const [startingPoolCash, setStartingPoolCash] = useState(
    String(company?.starting_pool_cash ?? 50000)
  );
  const [startingPoolShares, setStartingPoolShares] = useState(
    String(company?.starting_pool_shares ?? 5000)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: company?.id ?? null,
          name,
          ticker,
          description,
          sector,
          startingPoolCash: parseFloat(startingPoolCash),
          startingPoolShares: parseFloat(startingPoolShares),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save company");
        return;
      }
      if (!company) {
        setName("");
        setTicker("");
        setDescription("");
        setSector("general");
        setStartingPoolCash("50000");
        setStartingPoolShares("5000");
      }
      router.refresh();
      onDone?.();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </div>
        <div>
          <label className="label">Ticker</label>
          <input
            className="input font-mono uppercase"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            required
            maxLength={8}
          />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </div>
      <div>
        <label className="label">Sector</label>
        <input className="input" value={sector} onChange={(e) => setSector(e.target.value)} required maxLength={30} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">
            Starting pool cash {company && <span className="font-normal text-gray-400">(locked after creation)</span>}
          </label>
          <input
            className="input"
            type="number"
            min="1"
            step="0.01"
            value={startingPoolCash}
            onChange={(e) => setStartingPoolCash(e.target.value)}
            disabled={!!company}
            required
          />
        </div>
        <div>
          <label className="label">
            Starting pool shares {company && <span className="font-normal text-gray-400">(locked after creation)</span>}
          </label>
          <input
            className="input"
            type="number"
            min="1"
            step="0.01"
            value={startingPoolShares}
            onChange={(e) => setStartingPoolShares(e.target.value)}
            disabled={!!company}
            required
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Starting price = pool cash / pool shares = $
        {(parseFloat(startingPoolCash || "0") / parseFloat(startingPoolShares || "1")).toFixed(2)}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Saving..." : company ? "Save changes" : "Create company"}
      </button>
    </form>
  );
}
