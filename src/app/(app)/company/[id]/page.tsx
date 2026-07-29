import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/session";
import { PriceChart } from "@/components/PriceChart";
import { TradeForm } from "@/components/TradeForm";
import type { Company } from "@/lib/supabase/types";
import { companyPrice } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  const [{ data: company }, { data: history }, { data: recentTrades }, { data: holding }] =
    await Promise.all([
      supabase.from("companies").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("price_history")
        .select("price, recorded_at")
        .eq("company_id", id)
        .order("recorded_at", { ascending: false })
        .limit(200),
      supabase.rpc("recent_company_trades", { p_company_id: id, p_limit: 20 }),
      supabase.from("holdings").select("shares").eq("company_id", id).eq("user_id", profile.id).maybeSingle(),
    ]);

  if (!company) notFound();
  const typedCompany = company as Company;
  const price = companyPrice(typedCompany);
  const chartData = [...(history ?? [])].reverse();

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{typedCompany.name}</h1>
          <span className="font-mono text-sm text-gray-400">{typedCompany.ticker}</span>
          {typedCompany.is_delisted && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
              DELISTED
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">{typedCompany.description}</p>
        <p className="mt-1 text-2xl font-mono font-bold">${price.toFixed(2)}</p>
        <p className="text-xs text-gray-400 capitalize">Sector: {typedCompany.sector}</p>
      </div>

      <div className="card">
        <PriceChart data={chartData} />
      </div>

      <TradeForm
        companyId={typedCompany.id}
        poolCash={typedCompany.pool_cash}
        poolShares={typedCompany.pool_shares}
        isDelisted={typedCompany.is_delisted}
        userCashBalance={profile.cash_balance}
        userShares={holding?.shares ?? 0}
      />

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent market activity
        </h2>
        {!recentTrades || recentTrades.length === 0 ? (
          <p className="text-sm text-gray-400">No trades yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {recentTrades.map((t: { side: string; shares: number; price_per_share: number; created_at: string }, i: number) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <span className={t.side === "buy" ? "text-up" : "text-down"}>
                  {t.side === "buy" ? "Buy" : "Sell"} {t.shares.toFixed(2)} sh
                </span>
                <span className="font-mono text-gray-500">${t.price_per_share.toFixed(4)}</span>
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
