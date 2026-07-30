interface HoldingSlice {
  ticker: string;
  value: number;
}

const SEGMENT_COLORS = [
  "bg-brand-500",
  "bg-amber-500",
  "bg-teal-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-lime-500",
];

function assessment(largestSharePct: number, hasHoldings: boolean): string {
  if (!hasHoldings) return "You're 100% cash — safe, but no growth potential either.";
  if (largestSharePct >= 60) return "Highly concentrated — one stock dominates your portfolio.";
  if (largestSharePct >= 35) return "Concentrated — consider spreading into a few more companies.";
  if (largestSharePct >= 20) return "Reasonably diversified.";
  return "Well diversified across companies.";
}

export function DiversificationMeter({ holdings, cash }: { holdings: HoldingSlice[]; cash: number }) {
  const totalInvested = holdings.reduce((sum, h) => sum + h.value, 0);
  const total = totalInvested + cash;
  const largestHolding = holdings.reduce((max, h) => Math.max(max, h.value), 0);
  const largestSharePct = totalInvested > 0 ? (largestHolding / totalInvested) * 100 : 0;

  const segments = [
    ...holdings.map((h, i) => ({
      label: h.ticker,
      pct: total > 0 ? (h.value / total) * 100 : 0,
      colorClass: SEGMENT_COLORS[i % SEGMENT_COLORS.length]!,
    })),
    { label: "Cash", pct: total > 0 ? (cash / total) * 100 : 100, colorClass: "bg-gray-300 dark:bg-gray-600" },
  ].filter((s) => s.pct > 0);

  return (
    <div className="card">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Diversification
      </h2>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {segments.map((s, i) => (
          <div
            key={i}
            className={s.colorClass}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${s.colorClass}`} />
            {s.label} {s.pct.toFixed(0)}%
          </span>
        ))}
      </div>

      <p className="mt-3 text-sm font-medium">{assessment(largestSharePct, holdings.length > 0)}</p>
      <p className="mt-1 text-xs text-gray-400">
        Diversification means spreading your money across different companies so one bad company
        can&apos;t wipe out your whole portfolio.
      </p>
    </div>
  );
}
