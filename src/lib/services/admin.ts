import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db/client";
import { companies, gameSettings, priceHistory } from "@/lib/db/schema";

export class AdminError extends Error {}

export interface CompanyUpsertInput {
  id: string | null;
  name: string;
  ticker: string;
  description: string;
  sector: string;
  startingPoolCash: number;
  startingPoolShares: number;
}

export async function adminUpsertCompany(input: CompanyUpsertInput): Promise<string> {
  if (input.startingPoolCash <= 0 || input.startingPoolShares <= 0) {
    throw new AdminError("Starting pool cash and shares must be positive");
  }

  if (!input.id) {
    const [created] = await db
      .insert(companies)
      .values({
        name: input.name,
        ticker: input.ticker,
        description: input.description,
        sector: input.sector,
        poolCash: String(input.startingPoolCash),
        poolShares: String(input.startingPoolShares),
        totalShares: String(input.startingPoolShares),
        startingPoolCash: String(input.startingPoolCash),
        startingPoolShares: String(input.startingPoolShares),
      })
      .returning({ id: companies.id });

    if (!created) throw new AdminError("Failed to create company");

    await db.insert(priceHistory).values({
      companyId: created.id,
      price: String(input.startingPoolCash / input.startingPoolShares),
    });

    return created.id;
  }

  const [updated] = await db
    .update(companies)
    .set({
      name: input.name,
      ticker: input.ticker,
      description: input.description,
      sector: input.sector,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, input.id))
    .returning({ id: companies.id });

  if (!updated) throw new AdminError("Company not found");
  return updated.id;
}

export async function adminSetCompanyDelisted(companyId: string, delisted: boolean): Promise<void> {
  await db
    .update(companies)
    .set({ isDelisted: delisted, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
}

export async function adminSetStartingCash(amount: number): Promise<void> {
  if (amount <= 0) throw new AdminError("Starting cash must be positive");
  await db
    .update(gameSettings)
    .set({ defaultStartingCash: String(amount), updatedAt: new Date() })
    .where(eq(gameSettings.id, 1));
}

export async function getDefaultStartingCash(): Promise<number> {
  const [row] = await db.select().from(gameSettings).where(eq(gameSettings.id, 1)).limit(1);
  return row ? parseFloat(row.defaultStartingCash) : 1000;
}

/**
 * Wipes trading history and resets balances/prices to their configured
 * starting values, for a new class term. Company definitions and user
 * accounts are preserved.
 */
export async function resetGame(): Promise<void> {
  const startingCash = await getDefaultStartingCash();

  await withTransaction(async (client) => {
    await client.query(`delete from trades`);
    await client.query(`delete from price_history`);
    await client.query(`delete from net_worth_snapshots`);
    await client.query(`delete from events`);
    await client.query(`delete from holdings`);

    await client.query(`update users set cash_balance = $1 where role = 'student'`, [startingCash]);

    await client.query(
      `update companies
       set pool_cash = starting_pool_cash,
           pool_shares = starting_pool_shares,
           total_shares = starting_pool_shares,
           is_delisted = false,
           updated_at = now()`
    );

    await client.query(
      `insert into price_history (company_id, price)
       select id, round(starting_pool_cash / starting_pool_shares, 6) from companies`
    );
  });
}

/** True if no user currently has this username (case-insensitive). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`select exists(select 1 from users where lower(username) = lower(${username})) as exists`
  );
  return !rows.rows[0]?.exists;
}
