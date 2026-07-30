import Link from "next/link";
import { asc, desc, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable, events as eventsTable, priceHistory } from "@/lib/db/schema";
import { toCompany, toMarketEvent } from "@/lib/db/mappers";
import { NewsTicker } from "@/components/NewsTicker";
import { applyAmbientDrift } from "@/lib/services/drift";
import type { Company } from "@/lib/types";
import { companyPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Give quiet companies a small random nudge before rendering, so the
  // market feels alive even between trades/events -- see drift.ts.
  await applyAmbientDrift();

  const [companyRows, eventRows] = await Promise.all([
    db.select().from(companiesTable).orderBy(asc(companiesTable.sector), asc(companiesTable.name)),
    db.select().from(eventsTable).orderBy(desc(eventsTable.createdAt)).limit(20),
  ]);

  const companyList: Company[] = companyRows.map(toCompany);
  const events = eventRows.map(toMarketEvent);

  const baselineByCompany = new Map<string, number>();
  if (companyList.length > 0) {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const history = await db
      .select()
      .from(priceHistory)
      .where(gte(priceHistory.recordedAt, since))
      .orderBy(asc(priceHistory.recordedAt));

    for (const row of history) {
      if (!baselineByCompany.has(row.companyId)) {
        baselineByCompany.set(row.companyId, parseFloat(row.price));
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
      <NewsTicker initialEvents={events} />

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
                        <span className="ml-2 badge-danger">
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
