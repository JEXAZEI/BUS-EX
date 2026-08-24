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
    order by net_worth desc
  `);

  return result.rows.map((row) => ({
    userId: row.id,
    username: row.username,
    fullName: row.full_name,
    netWorth: parseFloat(row.net_worth),
  }));
}
