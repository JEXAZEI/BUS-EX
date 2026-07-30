import "server-only";
import { sql } from "drizzle-orm";
import { withTransaction, db } from "@/lib/db/client";
import { applyPriceShock, randomInRange } from "@/lib/services/events";
import { getMarketRegime, REGIME_DRIFT_RANGE, type MarketRegime } from "@/lib/services/regime";

// How long a company's price can sit still before it's due for an ambient
// nudge. Scaled to match the ~12h regimes in regime.ts: at roughly one
// tick per hour, a full bull/bear run compounds over ~10-14 ticks instead
// of the 100+ it would hit at a 5-minute interval, which would let a
// single rally compound into an unrealistic multiple within a day. The
// nudge's base size/direction range comes from the active market regime
// (regime.ts) -- see REGIME_DRIFT_RANGE -- then gets scaled per-company by
// that company's own volatility multiplier, so a "blue chip" barely moves
// while a hype stock swings much harder under the same market-wide regime.
const DRIFT_INTERVAL_MINUTES = 60;

/**
 * Gives every quiet, non-delisted company a small random price nudge if its
 * price hasn't moved (from a trade, an event, or a previous drift tick) in
 * a while, biased by the current market regime and scaled by the
 * company's own volatility so the market actually trends for a while
 * instead of just jittering around zero, and different companies feel
 * different. Called opportunistically whenever the dashboard is loaded --
 * there's no dedicated background worker, so the market "ticks" whenever
 * someone is actually looking at it, which in practice is close enough to
 * continuous for a classroom app. A company that just traded or had an
 * event fire won't be nudged again until the interval has passed.
 */
export async function applyAmbientDrift(): Promise<MarketRegime> {
  const regime = await getMarketRegime();
  const [baseMin, baseMax] = REGIME_DRIFT_RANGE[regime];

  const stale = await db.execute<{ id: string; volatility: string }>(sql`
    select c.id, c.volatility
    from companies c
    where not c.is_delisted
      and coalesce(
        (select max(ph.recorded_at) from price_history ph where ph.company_id = c.id),
        c.created_at,
        '-infinity'
      ) < now() - (${DRIFT_INTERVAL_MINUTES} * interval '1 minute')
  `);

  for (const row of stale.rows) {
    const volatility = parseFloat(row.volatility) || 1;
    const impactPct = randomInRange(baseMin * volatility, baseMax * volatility);
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
