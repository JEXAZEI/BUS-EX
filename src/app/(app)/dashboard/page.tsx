import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewsTicker } from "@/components/NewsTicker";
import type { Company } from "@/lib/supabase/types";
import { companyPrice } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: companies }, { data: events }] = await Promise.all([
    supabase.from("companies").select("*").order("sector").order("name"),
    supabase
      .from("events")
      .select("id, event_type, title, description, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const companyList = (companies ?? []) as Company[];

  let baselineByCompany = new Map<string, number>();
  if (companyList.length > 0) {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: history } = await supabase
      .from("price_history")
      .select("company_id, price, recorded_at")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true });

    for (const row of history ?? []) {
      if (!baselineByCompany.has(row.company_id)) {
        baselineByCompany.set(row.company_id, row.price);
      }
    }
  }

  const bySector = new Map<string, Company[]>();
  for (const c of companyList) {
    const list = bySector.get(c.sector) ?? [];
    list.push(c);
    bySector.set(c.sector, list);
  }

  return (
    <div>
      <NewsTicker initialEvents={events ?? []} />

      <h1 className="mb-4 text-xl font-bold">Market</h1>

      {[...bySector.entries()].map(([sector, list]) => (
        <div key={sector} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {sector}
          </h2>
          <div className="space-y-2">
            {list.map((c) => {
              const price = companyPrice(c);
              const baseline = baselineByCompany.get(c.id) ?? price;
              const pctChange = baseline > 0 ? ((price - baseline) / baseline) * 100 : 0;
              return (
                <Link
                  key={c.id}
                  href={`/company/${c.id}`}
                  className="card flex items-center justify-between hover:border-brand-300"
                >
                  <div>
                    <p className="font-semibold">
                      {c.name}{" "}
                      <span className="font-mono text-xs text-gray-400">{c.ticker}</span>
                      {c.is_delisted && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                          DELISTED
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{c.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">${price.toFixed(2)}</p>
                    <p className={`text-xs font-medium ${pctChange >= 0 ? "text-up" : "text-down"}`}>
                      {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
