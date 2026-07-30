"use client";

import { useEffect, useState } from "react";

interface Quote {
  ticker: string;
  price: number;
  pctChange: number;
}

export function TickerTape({ initialQuotes }: { initialQuotes: Quote[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/companies/prices");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.quotes) && data.quotes.length > 0) {
          setQuotes(data.quotes);
        }
      } catch {
        // Silently ignore -- the next poll will retry.
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  if (quotes.length === 0) return null;

  // Rendered twice back-to-back so a -50% transform loops seamlessly.
  const items = [...quotes, ...quotes];

  return (
    <div className="mb-4 overflow-hidden rounded-lg bg-ink-900" aria-hidden="true">
      <div className="ticker-track flex w-max gap-8 whitespace-nowrap py-2.5">
        {items.map((q, i) => (
          <span key={i} className="flex items-center gap-2 px-2 font-mono text-sm">
            <span className="font-bold tracking-wide text-white">{q.ticker}</span>
            <span className="mono-nums text-gray-300">${q.price.toFixed(2)}</span>
            <span
              className={`mono-nums font-semibold ${q.pctChange >= 0 ? "text-up-text-dark" : "text-down-text-dark"}`}
            >
              {q.pctChange >= 0 ? "▲" : "▼"} {Math.abs(q.pctChange).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
