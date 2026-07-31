import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

// The profile page (and its auto-refresh) calls this on every load. Without
// a throttle, a student idling on their profile page with auto-refresh
// running would insert a new near-identical point every ~20s, flooding the
// "net worth over time" chart with the same dense-cluster problem the price
// chart had (see PriceChart.tsx / drift.ts). One snapshot per throttle
// window is still plenty of resolution across a 5-day term.
const SNAPSHOT_THROTTLE_MINUTES = 5;

/** Records a net-worth snapshot (cash + holdings at spot price) for the profile's "net worth over time" chart, at most once per SNAPSHOT_THROTTLE_MINUTES per user. */
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

  await db.execute(sql`
    insert into net_worth_snapshots (user_id, net_worth)
    select ${userId}, ${String(netWorth)}
    where not exists (
      select 1 from net_worth_snapshots
      where user_id = ${userId}
        and recorded_at > now() - (${SNAPSHOT_THROTTLE_MINUTES} * interval '1 minute')
    )
  `);

  return netWorth;
}
