import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db/client";
import { companies, gameSettings, priceHistory, trades } from "@/lib/db/schema";

export class AdminError extends Error {}

export interface CompanyUpsertInput {
  id: string | null;
  name: string;
  ticker: string;
  description: string;
  sector: string;
  startingPoolCash: number;
  startingPoolShares: number;
  volatility: number;
}

export async function adminUpsertCompany(input: CompanyUpsertInput): Promise<string> {
  if (input.startingPoolCash <= 0 || input.startingPoolShares <= 0) {
    throw new AdminError("Starting pool cash and shares must be positive");
  }
  if (input.volatility <= 0) {
    throw new AdminError("Volatility must be positive");
  }

  if (!input.id) {
    // One transaction, so a company can never exist without its opening price
    // point -- the chart, the 24h change and drift all assume one is there.
    return db.transaction(async (tx) => {
      const [created] = await tx
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
          volatility: String(input.volatility),
        })
        .returning({ id: companies.id });

      if (!created) throw new AdminError("Failed to create company");

      await tx.insert(priceHistory).values({
        companyId: created.id,
        price: String(input.startingPoolCash / input.startingPoolShares),
      });

      return created.id;
    });
  }

  const [updated] = await db
    .update(companies)
    .set({
      name: input.name,
      ticker: input.ticker,
      description: input.description,
      sector: input.sector,
      volatility: String(input.volatility),
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

/**
 * Permanently removes a company -- only allowed if it has no trade history,
 * so a teacher can clean up a fat-fingered/duplicate company they just
 * created, but can't accidentally erase real students' trade records (which
 * would cascade-delete along with it). A company that's actually been
 * traded should be delisted instead, which is reversible and preserves
 * history.
 *
 * The "has it been traded" check and the delete have to be one atomic step,
 * locking the company row first. Done as two separate statements, a trade
 * that committed in between was invisible to the check and then cascade-
 * deleted by the delete: reproduced against a local database, a student paid
 * $200, and their holding and trade row both vanished while the cash stayed
 * gone -- money destroyed silently, with nothing left in the trade log to
 * explain it. In a game scored on final balances that is a corrupted result,
 * not just a tidy-up gone wrong.
 *
 * `for update` is what makes it safe, because executeTrade takes the same
 * lock on the same row. Whichever arrives first wins cleanly: if the trade
 * does, this re-reads and finds the trade history and refuses; if the delete
 * does, the trade blocks, then finds no company and fails with its normal
 * "Company not found".
 */
export async function adminDeleteCompany(companyId: string): Promise<void> {
  await withTransaction(async (client) => {
    const locked = await client.query<{ id: string }>(
      `select id from companies where id = $1 for update`,
      [companyId]
    );
    if (locked.rows.length === 0) throw new AdminError("Company not found");

    const traded = await client.query<{ id: string }>(
      `select id from trades where company_id = $1 limit 1`,
      [companyId]
    );
    if (traded.rows.length > 0) {
      throw new AdminError(
        "This company has trade history and can't be deleted -- delist it instead to preserve records."
      );
    }

    // Holdings without a trade row shouldn't be reachable today, but a
    // holding is someone's money either way -- refusing is free insurance
    // against a future path that grants shares without logging a trade.
    const held = await client.query<{ user_id: string }>(
      `select user_id from holdings where company_id = $1 and shares > 0 limit 1`,
      [companyId]
    );
    if (held.rows.length > 0) {
      throw new AdminError(
        "Students still hold shares in this company -- delist it instead to preserve their positions."
      );
    }

    await client.query(`delete from companies where id = $1`, [companyId]);
  });
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
    // Take every company lock up front, in a fixed order, before touching
    // anything else. executeTrade locks a company and then the user row, so
    // a reset that reached `update users` first and then wanted a company
    // deadlocked against an in-flight trade -- reproduced locally, and
    // Postgres picked the trade as the victim every time, which means a
    // student mid-purchase got "Trade failed. Try again." out of nowhere.
    // Victim choice isn't guaranteed though, so the reset itself could just
    // as easily have been the one to die.
    //
    // Ordering both paths companies-then-users removes the cycle entirely,
    // and it also closes a narrower hole: a trade that committed in the gap
    // between `delete from holdings` and the pool reset left its holding
    // behind against freshly-restored pools, so pool_shares plus holdings
    // exceeded total_shares and the student kept last term's shares on top
    // of a full starting balance. Holding the locks from the start means an
    // in-flight trade either commits before any of this (and gets wiped
    // with everything else) or waits and then reads the reset pools.
    // `order by id` keeps two concurrent resets from deadlocking each other.
    await client.query(`select id from companies order by id for update`);

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

/** True if no user currently has this email (case-insensitive). */
export async function isEmailAvailable(email: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`select exists(select 1 from users where lower(email) = lower(${email})) as exists`
  );
  return !rows.rows[0]?.exists;
}
