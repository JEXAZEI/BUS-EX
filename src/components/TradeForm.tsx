"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { previewTrade } from "@/lib/amm";

export function TradeForm({
  companyId,
  poolCash,
  poolShares,
  isDelisted,
  userCashBalance,
  userShares,
}: {
  companyId: string;
  poolCash: number;
  poolShares: number;
  isDelisted: boolean;
  userCashBalance: number;
  userShares: number;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sharesNum = parseFloat(shares);
  const preview = useMemo(() => {
    if (!sharesNum || sharesNum <= 0) return null;
    return previewTrade(poolCash, poolShares, side, sharesNum);
  }, [poolCash, poolShares, side, sharesNum]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!sharesNum || sharesNum <= 0) {
      setError("Enter a positive number of shares");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, side, shares: sharesNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Trade failed");
        return;
      }
      setMessage(
        `${side === "buy" ? "Bought" : "Sold"} ${sharesNum} shares for $${data.result.cash_amount.toFixed(2)}`
      );
      setShares("");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isDelisted) {
    return (
      <div className="alert-danger text-sm text-red-700 dark:text-red-300">
        This company is currently delisted and cannot be traded.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            side === "buy" ? "bg-up text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            side === "sell" ? "bg-down text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          Sell
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="shares">Shares</label>
          <input
            id="shares"
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
          <p>
            Cash balance: <span className="font-mono">${userCashBalance.toFixed(2)}</span>
          </p>
          <p>
            You own: <span className="font-mono">{userShares.toFixed(4)} shares</span>
          </p>
          {preview && (
            <p className="mt-1 font-medium text-gray-800">
              Est. {side === "buy" ? "cost" : "proceeds"}: $
              {preview.cashAmount.toFixed(2)} (~${preview.pricePerShare.toFixed(4)}/share)
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm delta-up">{message}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Submitting..." : side === "buy" ? "Buy shares" : "Sell shares"}
        </button>
      </form>
    </div>
  );
}
