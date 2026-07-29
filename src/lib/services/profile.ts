import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { netWorthSnapshots } from "@/lib/db/schema";

/** Records a net-worth snapshot (cash + holdings at spot price) for the profile's "net worth over time" chart. */
export async function snapshotNetWorth(userId: string): Promise<number> {
  const result = await db.execute<{ net_worth: string }>(sql`
    select
      u.cash_balance + coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0) as net_worth
    from users u
    left join holdings h on h.user_id = u.id
    left join companies c on c.id = h.company_id
    where u.id = ${userId}
    group by u.cash_balance
  `);

  const netWorth = parseFloat(result.rows[0]?.net_worth ?? "0");

  await db.insert(netWorthSnapshots).values({ userId, netWorth: String(netWorth) });

  return netWorth;
}
