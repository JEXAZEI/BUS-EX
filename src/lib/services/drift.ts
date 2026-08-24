import "server-only";
import { sql } from "drizzle-orm";
import { withTransaction, db } from "@/lib/db/client";
import { round, randomInRange } from "@/lib/services/events";
import {
  getMarketRegime,
  REGIME_BIAS,
  IDIOSYNCRATIC_DRIFT_RANGE,
  type MarketRegime,
} from "@/lib/services/regime";

// How long a company's price can sit still before it's due for an ambient
// nudge. 3 minutes, so the "1H" chart range button (PriceChart.tsx) has ~20
// real points to draw. At 15 minutes it had only 4, and a 4-point line
// interpolated into a smooth lazy curve that read as nothing like a stock
// chart -- the price genuinely was moving, there just weren't enough samples
// for the movement to have any texture. REGIME_BIAS and
// IDIOSYNCRATIC_DRIFT_RANGE (regime.ts) are scaled down to match this
// interval, so the market's actual hourly trend and volatility are
// unchanged -- the same movement, sampled 5x more finely. Each tick combines the
// active regime's shared bias with a per-company random idiosyncratic move
// so companies diverge from each other and from the overall trend, then the
// whole thing gets scaled by that company's own volatility multiplier, so a
// "blue chip" barely moves while a hype stock swings much harder under the
// same market-wide regime.
const DRIFT_INTERVAL_MINUTES = 3;

// There's no dedicated background worker (see below), so a company that
// nobody's checked on in a while needs to "catch up" all at once rather
// than getting a single tick as of right now -- otherwise a Friday-to-
// Monday gap would show as one lonely nudge and a long flat line on the
// chart. Still capped at 3 days of real time, which at 3-minute ticks is
// 1440 of them, so a genuinely long idle stretch (e.g. between class terms)
// doesn't do unbounded work. Safe for the batched insert below: 1440 rows x
// 3 bound parameters = 4320, well under Postgres's 65535-parameter ceiling.
const MAX_CATCHUP_TICKS = 1440;

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
        const companyRes = await client.query<{
          volatility: string;
          pool_cash: string;
          pool_shares: string;
          is_delisted: boolean;
        }>(`select volatility, pool_cash, pool_shares, is_delisted from companies where id = $1 for update`, [
          row.id,
        ]);
        const company = companyRes.rows[0];
        if (!company || company.is_delisted) return;

        const lastTickRes = await client.query<{ last_tick: Date }>(
          `select coalesce(max(recorded_at), (select created_at from companies where id = $1)) as last_tick
           from price_history where company_id = $1`,
          [row.id]
        );
        const lastTick = lastTickRes.rows[0]!.last_tick.getTime();
        const ticks = Math.min(Math.floor((now - lastTick) / intervalMs), MAX_CATCHUP_TICKS);
        if (ticks < 1) return;

        // Compute the whole catch-up sequence in memory and only round-trip
        // to the database twice (one update, one batched multi-row insert)
        // instead of once per tick. A single stale company can need up to
        // MAX_CATCHUP_TICKS ticks, each previously costing 3 sequential
        // round trips via applyPriceShock -- for a class that's sat idle
        // for a few days across every company at once, that added up to
        // thousands of sequential round trips in one page load. Locally
        // that was ~4s; against Neon's real network latency from a Vercel
        // function it's easily enough to blow past the serverless timeout,
        // which kills the response mid-stream -- something a browser
        // reports as a corrupted/truncated stream, not a normal error. The
        // math is identical either way (each tick's price only depends on
        // the previous tick's price via the same factor/floor logic
        // applyPriceShock used), this just stops doing it one DB call at a
        // time.
        const volatility = parseFloat(company.volatility) || 1;
        const poolShares = parseFloat(company.pool_shares);
        let poolCash = parseFloat(company.pool_cash);

        const values: string[] = [];
        const params: unknown[] = [];
        for (let i = 1; i <= ticks; i++) {
          const impactPct = volatility * (bias + randomInRange(noiseMin, noiseMax));
          let factor = 1 + impactPct;
          if (factor <= 0.01) factor = 0.01;
          poolCash *= factor;

          const tickTime = new Date(Math.min(lastTick + i * intervalMs, now));
          const price = round(poolCash / poolShares, 6);
          const base = params.length;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
          params.push(row.id, price, tickTime);
        }

        await client.query(`update companies set pool_cash = $1, updated_at = now() where id = $2`, [
          poolCash,
          row.id,
        ]);
        await client.query(
          `insert into price_history (company_id, price, recorded_at) values ${values.join(", ")}`,
          params
        );
      });
    } catch (err) {
      // One company's drift failing shouldn't block the others or the page
      // load that triggered this -- it's a cosmetic background effect.
      console.error(`Ambient drift failed for company ${row.id}:`, err);
    }
  }

  return regime;
}
