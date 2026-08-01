import "server-only";
import { sql } from "drizzle-orm";
import { withTransaction, db } from "@/lib/db/client";
import { applyPriceShock, randomInRange } from "@/lib/services/events";
import {
  getMarketRegime,
  REGIME_BIAS,
  IDIOSYNCRATIC_DRIFT_RANGE,
  type MarketRegime,
} from "@/lib/services/regime";

// How long a company's price can sit still before it's due for an ambient
// nudge. Scaled to match the ~12h regimes in regime.ts: at roughly one
// tick per hour, a full bull/bear run compounds over ~10-14 ticks instead
// of the 100+ it would hit at a 5-minute interval, which would let a
// single rally compound into an unrealistic multiple within a day. Each
// tick combines the active regime's shared bias (regime.ts, REGIME_BIAS)
// with a per-company random idiosyncratic move (IDIOSYNCRATIC_DRIFT_RANGE)
// so companies diverge from each other and from the overall trend, then
// the whole thing gets scaled by that company's own volatility multiplier,
// so a "blue chip" barely moves while a hype stock swings much harder
// under the same market-wide regime.
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
  const bias = REGIME_BIAS[regime];
  const [noiseMin, noiseMax] = IDIOSYNCRATIC_DRIFT_RANGE;
  const intervalMs = DRIFT_INTERVAL_MINUTES * 60_000;

  // Cheap, unlocked pre-filter -- just narrows down which companies are
  // worth taking a lock on. The real "how many ticks are we behind" number
  // is recomputed per company below, inside that company's own locked
  // transaction, since this list can be stale by the time we get there.
  const candidates = await db.execute<{ id: string }>(sql`
    select c.id
    from companies c
    where not c.is_delisted
      and coalesce(
        (select max(ph.recorded_at) from price_history ph where ph.company_id = c.id),
        c.created_at,
        '-infinity'
      ) < now() - (${DRIFT_INTERVAL_MINUTES} * interval '1 minute')
  `);

  const now = Date.now();

  for (const row of candidates.rows) {
    try {
      await withTransaction(async (client) => {
        // Lock the company row *before* deciding how many ticks it's
        // behind by. This page has no dedicated worker -- every page load
        // opportunistically calls applyAmbientDrift() for every company --
        // so two page loads landing close together can both see the same
        // stale company. Without a lock guarding the "how far behind is
        // it" read, both would independently compute e.g. "72 hours
        // behind" from the same last tick and each insert their own full
        // 72-tick backfill with an independent random walk, so the sorted
        // price history would interleave two diverging sequences over the
        // same window -- a chart that whips back and forth instead of
        // trending. Locking first makes the second caller block until the
        // first commits, then it re-reads a now-fresh last tick and
        // correctly finds nothing left to backfill.
        const companyRes = await client.query<{ volatility: string }>(
          `select volatility from companies where id = $1 for update`,
          [row.id]
        );
        const company = companyRes.rows[0];
        if (!company) return;

        const lastTickRes = await client.query<{ last_tick: Date }>(
          `select coalesce(max(recorded_at), (select created_at from companies where id = $1)) as last_tick
           from price_history where company_id = $1`,
          [row.id]
        );
        const lastTick = lastTickRes.rows[0]!.last_tick.getTime();
        const ticks = Math.min(Math.floor((now - lastTick) / intervalMs), MAX_CATCHUP_TICKS);
        if (ticks < 1) return;

        const volatility = parseFloat(company.volatility) || 1;
        for (let i = 1; i <= ticks; i++) {
          const impactPct = volatility * (bias + randomInRange(noiseMin, noiseMax));
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
