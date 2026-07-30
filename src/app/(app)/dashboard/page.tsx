import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { events as eventsTable } from "@/lib/db/schema";
import { toMarketEvent } from "@/lib/db/mappers";
import { NewsTicker } from "@/components/NewsTicker";
import { TickerTape } from "@/components/TickerTape";
import { applyAmbientDrift } from "@/lib/services/drift";
import { getCompanyQuotes } from "@/lib/services/quotes";
import type { MarketRegime } from "@/lib/services/regime";

export const dynamic = "force-dynamic";

const REGIME_DISPLAY: Record<MarketRegime, { label: string; icon: string; className: string }> = {
  bull: { label: "Bullish", icon: "▲", className: "delta-up" },
  bear: { label: "Bearish", icon: "▼", className: "delta-down" },
  neutral: { label: "Flat", icon: "▬", className: "text-gray-500 dark:text-gray-400" },
};

export default async function DashboardPage() {
  // Give quiet companies a small random nudge before rendering, so the
  // market feels alive even between trades/events -- see drift.ts. The
  // returned regime also drives the "Bullish/Bearish/Flat" badge below.
  const regime = await applyAmbientDrift();
  const regimeDisplay = REGIME_DISPLAY[regime];

  const [quotes, eventRows] = await Promise.all([
    getCompanyQuotes(),
    db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)).limit(20),
  ]);

  const events = eventRows.map(toMarketEvent);
  const tickerQuotes = quotes
    .filter((q) => !q.company.is_delisted)
    .map((q) => ({ ticker: q.company.ticker, price: q.price, pctChange: q.pctChange }));

  return (
    <div>
      <TickerTape initialQuotes={tickerQuotes} />
      <NewsTicker initialEvents={events} />

      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Market</h1>
        <div className="flex items-center gap-3">
          <span className={`mono-nums flex items-center gap-1 text-xs font-semibold ${regimeDisplay.className}`}>
            <span aria-hidden>{regimeDisplay.icon}</span>
            {regimeDisplay.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />
            Live
          </span>
        </div>
      </div>

      <div className="card overflow-hidden !p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
              <th className="px-4 py-2.5 font-semibold">Symbol</th>
              <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Sector</th>
              <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="px-4 py-2.5 text-right font-semibold">24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {quotes.map(({ company, price, pctChange }) => (
              <tr key={company.id} className="group">
                <td className="p-0">
                  <Link
                    href={`/company/${company.id}`}
                    className="flex items-center gap-2 px-4 py-3 group-hover:bg-gray-50 dark:group-hover:bg-white/5"
                  >
                    <div>
                      <p className="font-mono text-sm font-bold tracking-wide">{company.ticker}</p>
                      <p className="text-xs text-gray-400">{company.name}</p>
                    </div>
                    {company.is_delisted && <span className="badge-danger">DELISTED</span>}
                  </Link>
                </td>
                <td className="hidden p-0 sm:table-cell">
                  <Link
                    href={`/company/${company.id}`}
                    className="block px-4 py-3 capitalize text-gray-500 group-hover:bg-gray-50 dark:text-gray-400 dark:group-hover:bg-white/5"
                  >
                    {company.sector}
                  </Link>
                </td>
                <td className="p-0 text-right">
                  <Link
                    href={`/company/${company.id}`}
                    className="mono-nums block px-4 py-3 font-semibold group-hover:bg-gray-50 dark:group-hover:bg-white/5"
                  >
                    ${price.toFixed(2)}
                  </Link>
                </td>
                <td className="p-0 text-right">
                  <Link
                    href={`/company/${company.id}`}
                    className={`mono-nums block px-4 py-3 font-semibold group-hover:bg-gray-50 dark:group-hover:bg-white/5 ${
                      pctChange >= 0 ? "delta-up" : "delta-down"
                    }`}
                  >
                    {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
