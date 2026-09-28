import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable } from "@/lib/db/schema";
import { toCompany } from "@/lib/db/mappers";
import { companyPrice, type Company } from "@/lib/types";

export interface CompanyQuote {
  company: Company;
  price: number;
  baseline: number;
  dollarChange: number;
  pctChange: number;
}

/** Every company with its current spot price and its change vs. ~24h ago. */
export async function getCompanyQuotes(): Promise<CompanyQuote[]> {
  const companyRows = await db
    .select()
    .from(companiesTable)
    .orderBy(asc(companiesTable.sector), asc(companiesTable.name));
  const companyList = companyRows.map(toCompany);

  // One row per company: its first price inside the window. This used to
  // select the window's *entire* price history and keep the first row per
  // company in JS -- at 3-minute drift ticks that's ~500 rows per company,
  // ~10,000 rows (~1.2 MB) per call to produce 20 numbers. It runs on every
  // dashboard and company page render, their 20s auto-refresh, and the
  // ticker tape's 20s poll, so a class of 30 was pulling on the order of
  // 200 MB/min out of Neon, whose free tier meters egress. The lateral
  // subquery walks price_history_company_idx and stops at one row each.
  const baselineByCompany = new Map<string, number>();
  if (companyList.length > 0) {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const baselines = await db.execute<{ company_id: string; price: string }>(sql`
      select c.id as company_id, b.price
      from companies c
      cross join lateral (
        select ph.price
        from price_history ph
        where ph.company_id = c.id and ph.recorded_at >= ${since}
        order by ph.recorded_at asc
        limit 1
      ) b
    `);

    for (const row of baselines.rows) {
      baselineByCompany.set(row.company_id, parseFloat(row.price));
    }
  }

  return companyList.map((company) => {
    const price = companyPrice(company);
    const baseline = baselineByCompany.get(company.id) ?? price;
    const dollarChange = price - baseline;
    const pctChange = baseline > 0 ? (dollarChange / baseline) * 100 : 0;
    return { company, price, baseline, dollarChange, pctChange };
  });
}
