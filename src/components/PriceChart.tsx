"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  price: number;
  recorded_at: string;
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

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="time" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
            labelFormatter={(label) => label}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={up ? "#16a34a" : "#dc2626"}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
