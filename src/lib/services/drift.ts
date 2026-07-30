import "server-only";
import { sql } from "drizzle-orm";
import { withTransaction, db } from "@/lib/db/client";
import { applyPriceShock, randomInRange } from "@/lib/services/events";

// How long a company's price can sit still before it's due for an ambient
// nudge, and how big that nudge can be. Small/frequent enough to feel like
// a live market ticking between trades, small enough that it doesn't
// swamp real trading activity or admin-triggered events.
const DRIFT_INTERVAL_MINUTES = 5;
const MAX_DRIFT_PCT = 0.02;

/**
 * Gives every quiet, non-delisted company a small random price nudge if its
 * price hasn't moved (from a trade, an event, or a previous drift tick) in
 * a while. Called opportunistically whenever the dashboard is loaded --
 * there's no dedicated background worker, so the market "ticks" whenever
 * someone is actually looking at it, which in practice is close enough to
 * continuous for a classroom app. A company that just traded or had an
 * event fire won't be nudged again until the interval has passed.
 */
export async function applyAmbientDrift(): Promise<void> {
  const stale = await db.execute<{ id: string }>(sql`
    select c.id
    from companies c
    where not c.is_delisted
      and (
        select max(ph.recorded_at) from price_history ph where ph.company_id = c.id
      ) < now() - (${DRIFT_INTERVAL_MINUTES} * interval '1 minute')
  `);

  for (const row of stale.rows) {
    const impactPct = randomInRange(-MAX_DRIFT_PCT, MAX_DRIFT_PCT);
    try {
      await withTransaction((client) => applyPriceShock(client, row.id, impactPct));
    } catch (err) {
      // One company's drift failing shouldn't block the others or the page
      // load that triggered this -- it's a cosmetic background effect.
      console.error(`Ambient drift failed for company ${row.id}:`, err);
    }
  }
}
