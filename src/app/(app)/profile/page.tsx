import Link from "next/link";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { holdings, netWorthSnapshots, trades, companies as companiesTable } from "@/lib/db/schema";
import { getCurrentProfile } from "@/lib/session";
import { snapshotNetWorth } from "@/lib/services/profile";
import { PriceChart } from "@/components/PriceChart";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { companyPrice, type Company } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // Record a fresh net-worth snapshot every time the profile is viewed so
  // the chart below fills in over the course of the term.
  await snapshotNetWorth(profile.id);

  const [holdingsRows, snapshotRows, tradeRows] = await Promise.all([
    db
      .select({ shares: holdings.shares, company: companiesTable })
      .from(holdings)
      .innerJoin(companiesTable, eq(companiesTable.id, holdings.companyId))
      .where(and(eq(holdings.userId, profile.id), gt(holdings.shares, "0"))),
    db
      .select({ netWorth: netWorthSnapshots.netWorth, recordedAt: netWorthSnapshots.recordedAt })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, profile.id))
      .orderBy(desc(netWorthSnapshots.recordedAt))
      .limit(200),
    db
      .select({
        id: trades.id,
        side: trades.side,
        shares: trades.shares,
        cashAmount: trades.cashAmount,
        createdAt: trades.createdAt,
        companyName: companiesTable.name,
        companyTicker: companiesTable.ticker,
      })
      .from(trades)
      .innerJoin(companiesTable, eq(companiesTable.id, trades.companyId))
      .where(eq(trades.userId, profile.id))
      .orderBy(desc(trades.createdAt))
      .limit(30),
  ]);

  const holdingsList = holdingsRows.map((h) => ({
    shares: parseFloat(h.shares),
    company: {
      id: h.company.id,
      name: h.company.name,
      ticker: h.company.ticker,
      pool_cash: parseFloat(h.company.poolCash),
      pool_shares: parseFloat(h.company.poolShares),
    } as Pick<Company, "id" | "name" | "ticker" | "pool_cash" | "pool_shares">,
  }));

  const holdingsValue = holdingsList.reduce((sum, h) => sum + h.shares * companyPrice(h.company), 0);
  const netWorth = profile.cash_balance + holdingsValue;

  const chartData = [...snapshotRows]
    .reverse()
    .map((s) => ({ price: parseFloat(s.netWorth), recorded_at: s.recordedAt.toISOString() }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">@{profile.username}</h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{profile.role} account</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cash</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${profile.cash_balance.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Holdings</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${holdingsValue.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Net worth</p>
          <p className="mono-nums text-lg font-bold tabular-nums">${netWorth.toFixed(2)}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Net worth over time
        </h2>
        <PriceChart data={chartData} />
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Portfolio
        </h2>
        {holdingsList.length === 0 ? (
          <p className="text-sm text-gray-400">You don&apos;t own any shares yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {holdingsList.map((h) => (
              <li key={h.company.id} className="flex items-center justify-between py-2">
                <Link href={`/company/${h.company.id}`} className="font-medium hover:underline">
                  {h.company.name}{" "}
                  <span className="font-mono text-xs text-gray-400">{h.company.ticker}</span>
                </Link>
                <div className="text-right">
                  <p className="mono-nums font-mono">{h.shares.toFixed(4)} sh</p>
                  <p className="mono-nums font-mono text-xs text-gray-400">
                    ${(h.shares * companyPrice(h.company)).toFixed(2)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Your trade history
        </h2>
        {tradeRows.length === 0 ? (
          <p className="text-sm text-gray-400">No trades yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {tradeRows.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-1.5">
                <span>
                  <span className={t.side === "buy" ? "delta-up" : "delta-down"}>
                    {t.side === "buy" ? "Bought" : "Sold"}
                  </span>{" "}
                  {parseFloat(t.shares).toFixed(2)} {t.companyTicker}
                </span>
                <span className="mono-nums font-mono text-gray-500 dark:text-gray-400">
                  ${parseFloat(t.cashAmount).toFixed(2)}
                </span>
                <span className="text-xs text-gray-400">{t.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Change password
        </h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
