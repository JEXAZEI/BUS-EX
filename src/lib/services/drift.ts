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

// There's no dedicated background worker (see below), so a company that
// nobody's checked on in a while needs to "catch up" all at once rather
// than getting a single tick as of right now -- otherwise a Friday-to-
// Monday gap would show as one lonely nudge and a long flat line on the
// chart. Capped at 3 days' worth of hourly ticks so a genuinely long idle
// stretch (e.g. between class terms) doesn't do unbounded work.
const MAX_CATCHUP_TICKS = 72;

/**
 * Gives every quiet, non-delisted company a small random price nudge if its
 * price hasn't moved (from a trade, an event, or a previous drift tick) in
 * a while, biased by the current market regime and scaled by the
 * company's own volatility so the market actually trends for a while
 * instead of just jittering around zero, and different companies feel
 * different. Called opportunistically whenever the dashboard is loaded --
 * there's no dedicated background worker, so the market only actually
 * advances when someone loads a page. To compensate, a company that's
 * fallen behind gets backfilled with one tick per missed interval (each
 * with its own historical timestamp) instead of a single tick dated
 * "now" -- so the price history and chart look like the market kept
 * running the whole time, even though the computation only just happened.
 */
export async function applyAmbientDrift(): Promise<MarketRegime> {
  const regime = await getMarketRegime();
  const [baseMin, baseMax] = REGIME_DRIFT_RANGE[regime];
  const intervalMs = DRIFT_INTERVAL_MINUTES * 60_000;

  const stale = await db.execute<{ id: string; volatility: string; last_tick: string }>(sql`
    select c.id, c.volatility,
      coalesce(
        (select max(ph.recorded_at) from price_history ph where ph.company_id = c.id),
        c.created_at
      ) as last_tick
    from companies c
    where not c.is_delisted
      and coalesce(
        (select max(ph.recorded_at) from price_history ph where ph.company_id = c.id),
        c.created_at,
        '-infinity'
      ) < now() - (${DRIFT_INTERVAL_MINUTES} * interval '1 minute')
  `);

  const now = Date.now();

  for (const row of stale.rows) {
    const volatility = parseFloat(row.volatility) || 1;
    const lastTick = new Date(row.last_tick).getTime();
    const ticks = Math.min(Math.floor((now - lastTick) / intervalMs), MAX_CATCHUP_TICKS);
    if (ticks < 1) continue;

    try {
      await withTransaction(async (client) => {
        for (let i = 1; i <= ticks; i++) {
          const impactPct = randomInRange(baseMin * volatility, baseMax * volatility);
          const tickTime = new Date(Math.min(lastTick + i * intervalMs, now));
          await applyPriceShock(client, row.id, impactPct, tickTime);
        }
      });
    } catch (err) {
      // One company's drift failing shouldn't block the others or the page
      // load that triggered this -- it's a cosmetic background effect.
      console.error(`Ambient drift failed for company ${row.id}:`, err);
    }
  }

  return regime;
}
