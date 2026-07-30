import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getLeaderboard } from "@/lib/services/leaderboard";

export interface TermRecap {
  topTraders: { username: string; netWorth: number }[];
  mostActive: { username: string; tradeCount: number } | null;
  biggestTrade: { username: string; ticker: string; side: string; cashAmount: number } | null;
  topPerformer: { name: string; ticker: string; pctGain: number } | null;
}

/**
 * A fun end-of-term highlight reel, computed from whatever trading history
 * still exists -- must be called BEFORE resetGame() wipes trades/holdings,
 * since that's exactly the data this reads.
 */
export async function getTermRecap(): Promise<TermRecap> {
  const leaderboard = await getLeaderboard();
  const topTraders = leaderboard
    .slice(0, 3)
    .map((e) => ({ username: e.username, netWorth: e.netWorth }));

  const mostActiveResult = await db.execute<{ username: string; trade_count: string }>(sql`
    select u.username, count(*) as trade_count
    from trades t
    join users u on u.id = t.user_id
    group by u.username
    order by trade_count desc
    limit 1
  `);
  const mostActiveRow = mostActiveResult.rows[0];
  const mostActive = mostActiveRow
    ? { username: mostActiveRow.username, tradeCount: parseInt(mostActiveRow.trade_count, 10) }
    : null;

  const biggestTradeResult = await db.execute<{
    username: string;
    ticker: string;
    side: string;
    cash_amount: string;
  }>(sql`
    select u.username, c.ticker, t.side, t.cash_amount
    from trades t
    join users u on u.id = t.user_id
    join companies c on c.id = t.company_id
    order by t.cash_amount desc
    limit 1
  `);
  const biggestRow = biggestTradeResult.rows[0];
  const biggestTrade = biggestRow
    ? {
        username: biggestRow.username,
        ticker: biggestRow.ticker,
        side: biggestRow.side,
        cashAmount: parseFloat(biggestRow.cash_amount),
      }
    : null;

  const topPerformerResult = await db.execute<{ name: string; ticker: string; pct_gain: string }>(sql`
    select name, ticker,
      ((pool_cash / pool_shares) - (starting_pool_cash / starting_pool_shares))
        / (starting_pool_cash / starting_pool_shares) * 100 as pct_gain
    from companies
    order by pct_gain desc
    limit 1
  `);
  const topPerfRow = topPerformerResult.rows[0];
  const topPerformer = topPerfRow
    ? { name: topPerfRow.name, ticker: topPerfRow.ticker, pctGain: parseFloat(topPerfRow.pct_gain) }
    : null;

  return { topTraders, mostActive, biggestTrade, topPerformer };
}
