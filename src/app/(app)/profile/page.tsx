import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/session";
import { PriceChart } from "@/components/PriceChart";
import { companyPrice, type Company } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  // Record a fresh net-worth snapshot every time the profile is viewed so
  // the chart below fills in over the course of the term.
  await supabase.rpc("snapshot_my_net_worth");

  const [{ data: holdingsRaw }, { data: snapshots }, { data: trades }] = await Promise.all([
    supabase
      .from("holdings")
      .select("shares, company:companies(id, name, ticker, pool_cash, pool_shares, is_delisted)")
      .eq("user_id", profile.id)
      .gt("shares", 0),
    supabase
      .from("net_worth_snapshots")
      .select("net_worth, recorded_at")
      .eq("user_id", profile.id)
      .order("recorded_at", { ascending: false })
      .limit(200),
    supabase
      .from("trades")
      .select("id, side, shares, cash_amount, price_per_share, created_at, company:companies(name, ticker)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  type HoldingRow = { shares: number; company: Company | null };
  const holdings = (holdingsRaw ?? []) as unknown as HoldingRow[];

  const holdingsValue = holdings.reduce((sum, h) => {
    if (!h.company) return sum;
    return sum + h.shares * companyPrice(h.company);
  }, 0);
  const netWorth = profile.cash_balance + holdingsValue;

  const chartData = [...(snapshots ?? [])]
    .reverse()
    .map((s) => ({ price: s.net_worth, recorded_at: s.recorded_at }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">@{profile.username}</h1>
        <p className="text-sm text-gray-400 capitalize">{profile.role} account</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-xs text-gray-400">Cash</p>
          <p className="font-mono font-bold">${profile.cash_balance.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-400">Holdings value</p>
          <p className="font-mono font-bold">${holdingsValue.toFixed(2)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-400">Net worth</p>
          <p className="font-mono font-bold">${netWorth.toFixed(2)}</p>
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
        {holdings.length === 0 ? (
          <p className="text-sm text-gray-400">You don&apos;t own any shares yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {holdings.map(
              (h) =>
                h.company && (
                  <li key={h.company.id} className="flex items-center justify-between py-2">
                    <Link href={`/company/${h.company.id}`} className="font-medium hover:underline">
                      {h.company.name}{" "}
                      <span className="font-mono text-xs text-gray-400">{h.company.ticker}</span>
                    </Link>
                    <div className="text-right">
                      <p className="font-mono">{h.shares.toFixed(4)} sh</p>
                      <p className="font-mono text-xs text-gray-400">
                        ${(h.shares * companyPrice(h.company)).toFixed(2)}
                      </p>
                    </div>
                  </li>
                )
            )}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Your trade history
        </h2>
        {!trades || trades.length === 0 ? (
          <p className="text-sm text-gray-400">No trades yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {(trades as unknown as Array<{
              id: string;
              side: string;
              shares: number;
              cash_amount: number;
              price_per_share: number;
              created_at: string;
              company: { name: string; ticker: string } | null;
            }>).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-1.5">
                <span>
                  <span className={t.side === "buy" ? "text-up" : "text-down"}>
                    {t.side === "buy" ? "Bought" : "Sold"}
                  </span>{" "}
                  {t.shares.toFixed(2)} {t.company?.ticker ?? ""}
                </span>
                <span className="font-mono text-gray-500">${t.cash_amount.toFixed(2)}</span>
                <span className="text-xs text-gray-400">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
