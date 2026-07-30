import "server-only";
import { sql } from "drizzle-orm";
import { withTransaction, db } from "@/lib/db/client";
import { applyPriceShock, randomInRange } from "@/lib/services/events";
import { getMarketRegime, REGIME_DRIFT_RANGE, type MarketRegime } from "@/lib/services/regime";

// How long a company's price can sit still before it's due for an ambient
// nudge. Frequent enough to feel like a live market ticking between
// trades, infrequent enough that it doesn't swamp real trading activity or
// admin-triggered events. The nudge's size/direction range comes from the
// active market regime (regime.ts) -- see REGIME_DRIFT_RANGE.
const DRIFT_INTERVAL_MINUTES = 5;

/**
 * Gives every quiet, non-delisted company a small random price nudge if its
 * price hasn't moved (from a trade, an event, or a previous drift tick) in
 * a while, biased by the current market regime so the market actually
 * trends for a while instead of just jittering around zero. Called
 * opportunistically whenever the dashboard is loaded -- there's no
 * dedicated background worker, so the market "ticks" whenever someone is
 * actually looking at it, which in practice is close enough to continuous
 * for a classroom app. A company that just traded or had an event fire
 * won't be nudged again until the interval has passed.
 */
export async function applyAmbientDrift(): Promise<MarketRegime> {
  const regime = await getMarketRegime();
  const [min, max] = REGIME_DRIFT_RANGE[regime];

  const stale = await db.execute<{ id: string }>(sql`
    select c.id
    from companies c
    where not c.is_delisted
      and (
        select max(ph.recorded_at) from price_history ph where ph.company_id = c.id
      ) < now() - (${DRIFT_INTERVAL_MINUTES} * interval '1 minute')
  `);

  for (const row of stale.rows) {
    const impactPct = randomInRange(min, max);
    try {
      await withTransaction((client) => applyPriceShock(client, row.id, impactPct));
    } catch (err) {
      // One company's drift failing shouldn't block the others or the page
      // load that triggered this -- it's a cosmetic background effect.
      console.error(`Ambient drift failed for company ${row.id}:`, err);
    }
  }

  return regime;
}
