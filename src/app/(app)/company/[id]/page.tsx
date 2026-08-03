import { notFound } from "next/navigation";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable, holdings, priceHistory } from "@/lib/db/schema";
import { toCompany } from "@/lib/db/mappers";
import { getCurrentProfile } from "@/lib/session";
import { recentCompanyTrades } from "@/lib/services/trades";
import { applyAmbientDrift } from "@/lib/services/drift";
import { getCompanyQuotes } from "@/lib/services/quotes";
import { PriceChart } from "@/components/PriceChart";
import { TradeForm } from "@/components/TradeForm";
import { FundamentalsCard } from "@/components/FundamentalsCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { RelatedCompanies } from "@/components/RelatedCompanies";
import { companyPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  await applyAmbientDrift();

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
  // Covers the chart's full "5D" range button -- see PriceChart.tsx.
  const chartSince = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  const [companyRows, historyRows, baselineRows, recentTrades, holdingRows, quotes] = await Promise.all([
    db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1),
    db
      .select({ price: priceHistory.price, recorded_at: priceHistory.recordedAt })
      .from(priceHistory)
      .where(and(eq(priceHistory.companyId, id), gte(priceHistory.recordedAt, chartSince)))
      .orderBy(asc(priceHistory.recordedAt))
      .limit(5000),
    db
      .select({ price: priceHistory.price })
      .from(priceHistory)
      .where(and(eq(priceHistory.companyId, id), gte(priceHistory.recordedAt, since)))
      .orderBy(asc(priceHistory.recordedAt))
      .limit(1),
    recentCompanyTrades(id, 20),
    db
      .select({ shares: holdings.shares })
      .from(holdings)
      .where(and(eq(holdings.companyId, id), eq(holdings.userId, profile.id)))
      .limit(1),
    getCompanyQuotes(),
  ]);

  const companyRow = companyRows[0];
  if (!companyRow) notFound();
  const typedCompany = toCompany(companyRow);
  const price = companyPrice(typedCompany);
  const chartData = historyRows.map((h) => ({
    price: parseFloat(h.price),
    recorded_at: h.recorded_at.toISOString(),
  }));
  const holdingShares = holdingRows[0] ? parseFloat(holdingRows[0].shares) : 0;

  const baseline = baselineRows[0] ? parseFloat(baselineRows[0].price) : price;
  const dollarChange = price - baseline;
  const pctChange = baseline > 0 ? (dollarChange / baseline) * 100 : 0;
  const isUp = dollarChange >= 0;

  const last24hPrices = historyRows.filter((h) => h.recorded_at >= since).map((h) => parseFloat(h.price));
  const sessionHigh = Math.max(price, baseline, ...last24hPrices);
  const sessionLow = Math.min(price, baseline, ...last24hPrices);
  const latestTick = historyRows[historyRows.length - 1]?.recorded_at ?? new Date();

  const related = quotes
    .filter((q) => q.company.sector === typedCompany.sector && q.company.id !== typedCompany.id && !q.company.is_delisted)
    .slice(0, 4)
    .map((q) => ({ id: q.company.id, name: q.company.name, ticker: q.company.ticker, price: q.price, pctChange: q.pctChange }));

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="card">
        <div className="flex items-start gap-3">
          <CompanyAvatar name={typedCompany.name} ticker={typedCompany.ticker} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{typedCompany.name}</h1>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {typedCompany.ticker}
              </span>
              <span className="badge-muted capitalize">{typedCompany.sector}</span>
              {typedCompany.is_delisted && <span className="badge-danger">DELISTED</span>}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{typedCompany.description}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <p className="mono-nums text-4xl font-bold tabular-nums">${price.toFixed(2)}</p>
          <span
            className={`mono-nums inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${
              isUp
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            }`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(2)}%
          </span>
          <span className={`mono-nums text-sm font-semibold ${isUp ? "delta-up" : "delta-down"}`}>
            {isUp ? "+" : ""}
            {dollarChange.toFixed(2)} today
          </span>
        </div>
        <p className="text-xs text-gray-400">As of {latestTick.toLocaleString()}</p>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Open (24h)</dt>
            <dd className="mono-nums">${baseline.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">High (24h)</dt>
            <dd className="mono-nums">${sessionHigh.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Low (24h)</dt>
            <dd className="mono-nums">${sessionLow.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <PriceChart data={chartData} />
      </div>

      <FundamentalsCard
        price={price}
        totalShares={typedCompany.total_shares}
        poolShares={typedCompany.pool_shares}
        volatility={typedCompany.volatility}
      />

      <RelatedCompanies companies={related} />

      {profile.role === "student" ? (
        <TradeForm
          companyId={typedCompany.id}
          poolCash={typedCompany.pool_cash}
          poolShares={typedCompany.pool_shares}
          isDelisted={typedCompany.is_delisted}
          userCashBalance={profile.cash_balance}
          userShares={holdingShares}
        />
      ) : (
        <div className="card bg-gray-50 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
          Teacher and owner accounts cannot buy or sell shares.
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Recent market activity
        </h2>
        {recentTrades.length === 0 ? (
          <p className="text-sm text-gray-400">No trades yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {recentTrades.map((t, i) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <span className={`font-medium ${t.side === "buy" ? "delta-up" : "delta-down"}`}>
                  {t.side === "buy" ? "Buy" : "Sell"} {t.shares.toFixed(2)} sh
                </span>
                <span className="mono-nums font-mono text-gray-500 dark:text-gray-400">
                  ${t.price_per_share.toFixed(4)}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(t.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Trades are shown anonymously here. Your full personal trade history is on your profile page.
        </p>
      </div>
    </div>
  );
}
