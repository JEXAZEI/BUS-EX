import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  fullName: string;
  netWorth: number;
}

/**
 * Ranks every active student by net worth (cash + holdings at spot price)
 * in one query, mirroring the per-user calculation in
 * src/lib/services/profile.ts. Teachers/owners are excluded -- they can't
 * trade (see trades.ts), so their balance is just whatever starting cash
 * they were created with, not a meaningful ranking.
 *
 * Ties break on name then id so the order is fully specified. Net worth
 * alone leaves it up to the query plan, and at the start of a term every
 * student is tied on exactly the starting cash -- a whole class of ties,
 * re-rendered every 20 seconds by AutoRefresh. It was stable in practice
 * when tested with 13 tied students, but "stable in practice" is not
 * something to rely on for a list people are watching, and the export
 * (export.ts) turns this same ordering into a hard Rank column in the
 * teacher's gradebook.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const result = await db.execute<{
    id: string;
    username: string;
    full_name: string;
    net_worth: string;
  }>(sql`
    select
      u.id,
      u.username,
      u.full_name,
      u.cash_balance + coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0) as net_worth
    from users u
    left join holdings h on h.user_id = u.id
    left join companies c on c.id = h.company_id
    where u.role = 'student' and u.is_active
    group by u.id, u.username, u.full_name, u.cash_balance
    order by net_worth desc, u.full_name asc, u.id asc
  `);

  return result.rows.map((row) => ({
    userId: row.id,
    username: row.username,
    fullName: row.full_name,
    netWorth: parseFloat(row.net_worth),
  }));
}
