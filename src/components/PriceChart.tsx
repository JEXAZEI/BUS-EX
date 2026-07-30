"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  price: number;
  recorded_at: string;
}

type RangeKey = "1H" | "1D" | "5D";

// Scaled to this game's actual timescale (a ~5 day class term) rather than
// Google Finance's years-long ranges -- 5D is effectively "the whole term."
const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: "1H", label: "1H", ms: 60 * 60 * 1000 },
  { key: "1D", label: "1D", ms: 24 * 60 * 60 * 1000 },
  { key: "5D", label: "5D", ms: 5 * 24 * 60 * 60 * 1000 },
];

function formatTick(ts: number, range: RangeKey): string {
  const d = new Date(ts);
  if (range === "5D") {
    return d.toLocaleDateString(undefined, { weekday: "short", hour: "numeric" });
  }
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { time: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!;
  return (
    <div className="rounded-md bg-ink-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg">
      <p className="mono-nums font-semibold">${point.value.toFixed(2)}</p>
      <p className="text-gray-400">{new Date(point.payload.time).toLocaleString()}</p>
    </div>
  );
}

export function PriceChart({ data }: { data: Point[] }) {
  const [range, setRange] = useState<RangeKey>("1D");

  const sorted = useMemo(
    () =>
      [...data]
        .map((d) => ({ price: d.price, time: new Date(d.recorded_at).getTime() }))
        .sort((a, b) => a.time - b.time),
    [data]
  );

  const activeRange = RANGES.find((r) => r.key === range)!;
  const filtered = useMemo(() => {
    const cutoff = Date.now() - activeRange.ms;
    return sorted.filter((d) => d.time >= cutoff);
  }, [sorted, activeRange]);

  // If the selected window has too little data (e.g. a quiet company on
  // "1H"), fall back to the most recent couple of points so the chart
  // isn't just an empty box -- still clearly labeled by the range buttons.
  const chartData = filtered.length >= 2 ? filtered : sorted.slice(-2);

  const up = chartData.length > 0 && chartData[chartData.length - 1]!.price >= chartData[0]!.price;
  const stroke = up ? "#16a34a" : "#dc2626";
  const gradientId = `price-fill-${up ? "up" : "down"}`;

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
              range === r.key
                ? "bg-brand-600 text-white"
                : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {chartData.length < 2 ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-400">
          Not enough price history yet.
        </div>
      ) : (
        <div className="h-48 w-full text-gray-200 dark:text-gray-700">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="currentColor" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => formatTick(v, range)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, stroke, strokeWidth: 2, fill: "white" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
