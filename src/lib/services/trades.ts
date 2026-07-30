import "server-only";
import { eq, desc } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db/client";
import { trades } from "@/lib/db/schema";
import type { TradeSide } from "@/lib/types";

export class TradeError extends Error {}

export interface TradeResult {
  cashAmount: number;
  pricePerShare: number;
  newSpotPrice: number;
  newCashBalance: number;
  newHoldingShares: number;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * The single place shares/cash can move for a normal trade. Recomputes the
 * price from the live constant-product pool inside a locked transaction --
 * the caller only supplies a share quantity, never a price, so a stale or
 * manipulated client-side estimate can't cause an unexpected trade.
 */
export async function executeTrade(
  userId: string,
  companyId: string,
  side: TradeSide,
  shares: number
): Promise<TradeResult> {
  if (!shares || shares <= 0) {
    throw new TradeError("Share quantity must be positive");
  }

  return withTransaction(async (client) => {
    const companyRes = await client.query<{
      pool_cash: string;
      pool_shares: string;
      is_delisted: boolean;
    }>(`select pool_cash, pool_shares, is_delisted from companies where id = $1 for update`, [
      companyId,
    ]);
    const company = companyRes.rows[0];
    if (!company) throw new TradeError("Company not found");
    if (company.is_delisted) {
      throw new TradeError("This company is currently delisted and cannot be traded");
    }

    const userRes = await client.query<{ cash_balance: string; role: string; is_active: boolean }>(
      `select cash_balance, role, is_active from users where id = $1 for update`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) throw new TradeError("Profile not found");
    if (!user.is_active) throw new TradeError("This account has been disabled");
    if (user.role !== "student") {
      throw new TradeError("Teacher and owner accounts cannot buy or sell shares");
    }

    const poolCash = parseFloat(company.pool_cash);
    const poolShares = parseFloat(company.pool_shares);
    const userCash = parseFloat(user.cash_balance);
    const k = poolCash * poolShares;

    let newPoolCash: number;
    let newPoolShares: number;
    let cashAmount: number;

    if (side === "buy") {
      newPoolShares = poolShares - shares;
      if (newPoolShares <= 0) {
        throw new TradeError("Not enough shares available in the market for that order");
      }
      newPoolCash = k / newPoolShares;
      cashAmount = round(newPoolCash - poolCash, 2);
      if (cashAmount <= 0) throw new TradeError("Invalid trade");
      if (cashAmount > userCash) {
        throw new TradeError("Insufficient cash balance for this purchase");
      }

      await client.query(`update users set cash_balance = cash_balance - $1 where id = $2`, [
        cashAmount,
        userId,
      ]);
      await client.query(
        `insert into holdings (user_id, company_id, shares) values ($1, $2, $3)
         on conflict (user_id, company_id) do update set shares = holdings.shares + excluded.shares`,
        [userId, companyId, shares]
      );
    } else {
      const holdingRes = await client.query<{ shares: string }>(
        `select shares from holdings where user_id = $1 and company_id = $2 for update`,
        [userId, companyId]
      );
      const ownedShares = holdingRes.rows[0] ? parseFloat(holdingRes.rows[0].shares) : 0;
      if (ownedShares < shares) {
        throw new TradeError("You do not own enough shares to sell that amount");
      }

      newPoolShares = poolShares + shares;
      newPoolCash = k / newPoolShares;
      cashAmount = round(poolCash - newPoolCash, 2);
      if (cashAmount <= 0 || cashAmount >= poolCash) {
        throw new TradeError("Invalid trade");
      }

      await client.query(`update users set cash_balance = cash_balance + $1 where id = $2`, [
        cashAmount,
        userId,
      ]);
      await client.query(
        `update holdings set shares = shares - $1 where user_id = $2 and company_id = $3`,
        [shares, userId, companyId]
      );
    }

    await client.query(
      `update companies set pool_cash = $1, pool_shares = $2, updated_at = now() where id = $3`,
      [newPoolCash, newPoolShares, companyId]
    );

    const pricePerShare = round(cashAmount / shares, 6);
    await client.query(
      `insert into trades (user_id, company_id, side, shares, cash_amount, price_per_share)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, companyId, side, shares, cashAmount, pricePerShare]
    );

    const newSpotPrice = round(newPoolCash / newPoolShares, 6);
    await client.query(`insert into price_history (company_id, price) values ($1, $2)`, [
      companyId,
      newSpotPrice,
    ]);

    const newCashRes = await client.query<{ cash_balance: string }>(
      `select cash_balance from users where id = $1`,
      [userId]
    );
    const newHoldingRes = await client.query<{ shares: string }>(
      `select shares from holdings where user_id = $1 and company_id = $2`,
      [userId, companyId]
    );

    return {
      cashAmount,
      pricePerShare,
      newSpotPrice,
      newCashBalance: parseFloat(newCashRes.rows[0]!.cash_balance),
      newHoldingShares: parseFloat(newHoldingRes.rows[0]?.shares ?? "0"),
    };
  });
}

/** Anonymized recent-trades feed for a company's public detail page (no user identity). */
export async function recentCompanyTrades(companyId: string, limit = 20) {
  const rows = await db
    .select({
      side: trades.side,
      shares: trades.shares,
      pricePerShare: trades.pricePerShare,
      createdAt: trades.createdAt,
    })
    .from(trades)
    .where(eq(trades.companyId, companyId))
    .orderBy(desc(trades.createdAt))
    .limit(Math.min(limit, 50));

  return rows.map((r) => ({
    side: r.side,
    shares: parseFloat(r.shares),
    price_per_share: parseFloat(r.pricePerShare),
    created_at: r.createdAt.toISOString(),
  }));
}
