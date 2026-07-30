import "server-only";
import { asc, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies as companiesTable, priceHistory } from "@/lib/db/schema";
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

  return companyList.map((company) => {
    const price = companyPrice(company);
    const baseline = baselineByCompany.get(company.id) ?? price;
    const dollarChange = price - baseline;
    const pctChange = baseline > 0 ? (dollarChange / baseline) * 100 : 0;
    return { company, price, baseline, dollarChange, pctChange };
  });
}
