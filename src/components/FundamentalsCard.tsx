interface Stat {
  label: string;
  value: string;
  caption: string;
}

export function FundamentalsCard({
  price,
  totalShares,
  poolShares,
  volatility,
}: {
  price: number;
  totalShares: number;
  poolShares: number;
  volatility: number;
}) {
  const marketCap = price * totalShares;
  const inCirculation = totalShares - poolShares;

  const stats: Stat[] = [
    {
      label: "Market cap",
      value: `$${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      caption: "Price × total shares — the whole company's value",
    },
    {
      label: "Shares outstanding",
      value: totalShares.toLocaleString(),
      caption: "Total shares that exist for this company",
    },
    {
      label: "In circulation",
      value: inCirculation.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      caption: "Held by traders, not sitting in the market maker",
    },
    {
      label: "Beta",
      value: `${volatility.toFixed(1)}×`,
      caption: "How much it swings vs. an average stock (1.0× = average)",
    },
  ];

  return (
    <div className="card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Fundamentals
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className="mono-nums text-lg font-bold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-gray-400">{s.caption}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
