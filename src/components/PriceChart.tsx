"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

// Robinhood/Google-Finance-style up/down colors -- more saturated and more
// immediately recognizable as "a stock chart" than the generic Tailwind
// green/red used before.
const UP_COLOR = "#00c805";
const DOWN_COLOR = "#ff3b30";

function formatTick(ts: number, range: RangeKey): string {
  const d = new Date(ts);
  if (range === "5D") {
    return d.toLocaleDateString(undefined, { weekday: "short", hour: "numeric" });
  }
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatPrice(v: number): string {
  return `$${v.toFixed(v < 10 ? 2 : v < 1000 ? 2 : 0)}`;
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

  const baseline = chartData[0]?.price ?? 0;
  const up = chartData.length > 0 && chartData[chartData.length - 1]!.price >= baseline;
  const stroke = up ? UP_COLOR : DOWN_COLOR;
  const gradientId = `price-fill-${up ? "up" : "down"}`;

  // recharts' automatic tick placement (minTickGap) assumes roughly evenly
  // spaced data -- it doesn't hold up once ambient drift backfills a big
  // cluster of hourly catch-up ticks (drift.ts) into a short span, which
  // packs far more points into the visible window than it expects and
  // makes it draw overlapping, unreadable labels. Generating a small, fixed
  // number of evenly-spaced tick positions across the visible time range
  // ourselves sidesteps that entirely -- always exactly TICK_COUNT labels,
  // evenly spread, regardless of how the underlying points are clustered.
  const TICK_COUNT = 5;
  const axisTicks = useMemo(() => {
    if (chartData.length < 2) return [];
    const first = chartData[0]!.time;
    const last = chartData[chartData.length - 1]!.time;
    if (first === last) return [first];
    return Array.from(
      { length: TICK_COUNT },
      (_, i) => first + ((last - first) * i) / (TICK_COUNT - 1)
    );
  }, [chartData]);

  // A real stock chart's Y axis is padded so normal noise doesn't fill the
  // whole vertical height -- fitting the axis tightly to just [min, max] of
  // whatever's visible (the old "auto" domain) makes even a 1% wobble look
  // like a dramatic swing. A fixed ~15% headroom above and below keeps the
  // line's shape readable and proportionate no matter the range.
  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1];
    const prices = chartData.map((d) => d.price);
    const min = Math.min(...prices, baseline);
    const max = Math.max(...prices, baseline);
    const pad = (max - min) * 0.15 || max * 0.05 || 1;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData, baseline]);

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
        <div className="flex h-56 items-center justify-center text-sm text-gray-400">
          Not enough price history yet.
        </div>
      ) : (
        <div className="h-56 w-full text-gray-100 dark:text-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="currentColor" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                ticks={axisTicks}
                tickFormatter={(v) => formatTick(v, range)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={formatPrice}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickCount={5}
                width={52}
                orientation="right"
              />
              <ReferenceLine y={baseline} stroke="#9ca3af" strokeDasharray="3 3" strokeOpacity={0.6} />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "#9ca3af", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, stroke, strokeWidth: 2, fill: "white" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
