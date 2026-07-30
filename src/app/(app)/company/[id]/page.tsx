import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable, holdings, priceHistory } from "@/lib/db/schema";
import { toCompany } from "@/lib/db/mappers";
import { getCurrentProfile } from "@/lib/session";
import { recentCompanyTrades } from "@/lib/services/trades";
import { applyAmbientDrift } from "@/lib/services/drift";
import { PriceChart } from "@/components/PriceChart";
import { TradeForm } from "@/components/TradeForm";
import { FundamentalsCard } from "@/components/FundamentalsCard";
import { companyPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  await applyAmbientDrift();

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);

  const [companyRows, historyRows, baselineRows, recentTrades, holdingRows] = await Promise.all([
    db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1),
    db
      .select({ price: priceHistory.price, recorded_at: priceHistory.recordedAt })
      .from(priceHistory)
      .where(eq(priceHistory.companyId, id))
      .orderBy(desc(priceHistory.recordedAt))
      .limit(200),
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
  ]);

  const companyRow = companyRows[0];
  if (!companyRow) notFound();
  const typedCompany = toCompany(companyRow);
  const price = companyPrice(typedCompany);
  const chartData = [...historyRows]
    .reverse()
    .map((h) => ({ price: parseFloat(h.price), recorded_at: h.recorded_at.toISOString() }));
  const holdingShares = holdingRows[0] ? parseFloat(holdingRows[0].shares) : 0;

  const baseline = baselineRows[0] ? parseFloat(baselineRows[0].price) : price;
  const dollarChange = price - baseline;
  const pctChange = baseline > 0 ? (dollarChange / baseline) * 100 : 0;
  const isUp = dollarChange >= 0;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">{typedCompany.name}</h1>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {typedCompany.ticker}
          </span>
          <span className="badge-muted capitalize">{typedCompany.sector}</span>
          {typedCompany.is_delisted && <span className="badge-danger">DELISTED</span>}
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{typedCompany.description}</p>

        <div className="mt-3 flex items-baseline gap-3">
          <p className="mono-nums text-4xl font-bold tabular-nums">${price.toFixed(2)}</p>
          <p className={`mono-nums flex items-center gap-1 text-sm font-semibold ${isUp ? "delta-up" : "delta-down"}`}>
            <span aria-hidden>{isUp ? "▲" : "▼"}</span>
            {isUp ? "+" : ""}
            {dollarChange.toFixed(2)} ({isUp ? "+" : ""}
            {pctChange.toFixed(2)}%)
          </p>
        </div>
        <p className="text-xs text-gray-400">Past 24h</p>
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
