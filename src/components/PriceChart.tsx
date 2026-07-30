"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  price: number;
  recorded_at: string;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: { time: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!;
  return (
    <div className="rounded-md bg-ink-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg">
      <p className="mono-nums font-semibold">${point.value.toFixed(2)}</p>
      <p className="text-gray-400">{point.payload.time}</p>
    </div>
  );
}

export function PriceChart({ data }: { data: Point[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        Not enough price history yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    price: d.price,
    time: new Date(d.recorded_at).toLocaleString(),
  }));

  const up = chartData[chartData.length - 1]!.price >= chartData[0]!.price;
  const stroke = up ? "#16a34a" : "#dc2626";
  const gradientId = `price-fill-${up ? "up" : "down"}`;

  return (
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
          <XAxis dataKey="time" hide />
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
  );
}
