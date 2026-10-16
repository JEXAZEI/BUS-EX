import "server-only";
import { eq, desc } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db/client";
import { trades } from "@/lib/db/schema";
import { MIN_SPOT_PRICE } from "@/lib/services/events";
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
 * Cash always rounds to the cent against whoever is trading: up when they
 * pay, down when they're paid.
 *
 * Rounding to nearest looks fairer and is the exploit. Share quantities are
 * exact to 4 dp while cash is only exact to the cent, so a quantity whose
 * fair cost lands just above a half-cent gets billed down -- the student
 * receives shares worth more than they were charged, and the gap is real
 * money the moment they sell. The direction is selectable, so it isn't luck:
 * at a $100,000 / 2,500-share pool, buying 0.0036 shares cost $0.144 and
 * billed $0.14, free value on every single trade. Driven through the real
 * API, 60 of those plus one sell of the whole position turned $1000.00 into
 * $1000.24 -- roughly $14/hour at the trade rate limit, no market risk, in a
 * game scored purely on final balance.
 *
 * Rounding against the trader makes the sub-cent remainder a cost instead of
 * a prize, so the loop bleeds a cent a round-trip rather than paying out,
 * and the remainder stays in the pool where it reads as a tiny spread. On a
 * real order it's a rounding error (a cent on a $200 trade); only
 * sub-cent-sized orders feel it, which is exactly who should.
 */
function cashCeil(n: number): number {
  return Math.ceil(n * 100) / 100;
}

function cashFloor(n: number): number {
  return Math.floor(n * 100) / 100;
}

/**
 * Orders worth less than a cent are refused outright rather than billed up
 * to a cent, so nobody is charged real money for a sliver of a share they
 * didn't mean to order.
 */
const MIN_TRADE_VALUE = 0.01;

/** Scale of every share column in db/schema.sql (numeric(18, 4)). */
const SHARE_DECIMALS = 4;

/** Cash rounds to the cent, so a sliver of a share can come to $0.00. */
const TOO_SMALL = "That order is worth less than a cent. Try more shares.";

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
  requestedShares: number
): Promise<TradeResult> {
  // Every share column is numeric(18, 4), so Postgres silently rounds any
  // finer quantity -- but the pool math below ran on the unrounded float.
  // Buying 0.12345 shares moved 0.12345 out of the pool and credited 0.1235
  // to the holding, conjuring 0.00005 of a share. Enough of that pushed
  // pool + holdings past total_shares, and then selling the whole position
  // back tripped the pool_shares <= total_shares constraint: a 500, with the
  // student unable to sell. Quantizing up front keeps the pool, the holding
  // and the trade log agreeing to the last digit.
  const shares = round(requestedShares, SHARE_DECIMALS);
  if (!shares || shares <= 0) {
    throw new TradeError("Share quantity must be at least 0.0001");
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

    // `k` sets the *price* for this one trade and nothing more. The pool is
    // then moved by exactly the cash that changed hands, which leaves it a
    // fraction of a cent off the k curve -- deliberately.
    //
    // Pricing off k but settling on the unrounded delta used to mean the
    // student was charged round(delta, 2) while the pool received the full
    // delta, so up to half a cent was conjured or destroyed per trade. The
    // direction is selectable: at these pool values a 0.0036-share buy cost
    // $0.144 and billed $0.14, so the student got $0.004 of pool value free,
    // every single time. Driven through the real API, 60 such buys followed
    // by one sell of the whole position turned $1000.00 into $1000.24 --
    // about $14/hour at the trade rate limit, with no market risk at all, in
    // a game whose entire score is final balance.
    //
    // Settling on the rounded figure makes student cash plus pool cash
    // exactly conserved, so there is nothing left to skim: whatever you pay
    // in, you get back out and no more. k drifting is harmless because it is
    // recomputed from the live pool on every trade and never stored, so
    // nothing accumulates. Do not "restore" the invariant by deriving
    // newPoolCash from k again -- that is this bug.
    const k = poolCash * poolShares;

    let newPoolCash: number;
    let newPoolShares: number;
    let cashAmount: number;

    if (side === "buy") {
      newPoolShares = round(poolShares - shares, SHARE_DECIMALS);
      if (newPoolShares <= 0) {
        throw new TradeError("Not enough shares available in the market for that order");
      }
      const fairCost = k / newPoolShares - poolCash;
      if (fairCost < MIN_TRADE_VALUE) throw new TradeError(TOO_SMALL);
      cashAmount = cashCeil(fairCost);
      if (cashAmount > userCash) {
        throw new TradeError("Insufficient cash balance for this purchase");
      }
      // The pool receives exactly what the student is charged -- see the
      // note on `k` above.
      newPoolCash = poolCash + cashAmount;

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

      newPoolShares = round(poolShares + shares, SHARE_DECIMALS);
      const fairProceeds = poolCash - k / newPoolShares;
      if (fairProceeds < MIN_TRADE_VALUE) throw new TradeError(TOO_SMALL);
      cashAmount = cashFloor(fairProceeds);
      if (cashAmount >= poolCash) throw new TradeError("Invalid trade");
      // The pool gives up exactly what the student is paid.
      newPoolCash = poolCash - cashAmount;

      await client.query(`update users set cash_balance = cash_balance + $1 where id = $2`, [
        cashAmount,
        userId,
      ]);
      await client.query(
        `update holdings set shares = shares - $1 where user_id = $2 and company_id = $3`,
        [shares, userId, companyId]
      );
    }

    // A sell takes cash out of the pool and puts shares back in, so a big
    // enough one on an already-collapsed company drives the spot price under
    // what price_history can store (numeric(18,6), `price > 0`) and the
    // insert below would 500. Unlike a shock, a trade has a counterparty, so
    // the price can't just be clamped -- that would hand the student cash the
    // pool never gave up. Refusing is the honest outcome, and the message
    // says what happened rather than "Trade failed. Try again."
    // Still inside the transaction, so the cash and holdings writes above
    // roll back with it.
    if (newPoolCash / newPoolShares < MIN_SPOT_PRICE) {
      throw new TradeError(
        "That order would push the price below the market's minimum. Try selling fewer shares."
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
