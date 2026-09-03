import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gameSettings } from "@/lib/db/schema";

export type MarketRegime = "bull" | "bear" | "neutral";

export interface RegimeStatus {
  regime: MarketRegime;
  startedAt: Date;
  endsAt: Date;
}

// Real bull markets grind upward for a long stretch; real bear markets are
// sharper and shorter -- a crash, then it's over. Giving each regime its
// own duration range (rather than one shared range for all three) lets bull
// runs simply last longer than bear runs, on top of bull also being picked
// more often (REGIME_WEIGHTS below) -- both push the term toward spending
// more real time trending up than down.
export const REGIME_DURATION_MINUTES: Record<MarketRegime, [number, number]> = {
  bull: [14 * 60, 20 * 60], // 14-20h -- a long, grinding run
  neutral: [8 * 60, 12 * 60], // 8-12h
  bear: [5 * 60, 9 * 60], // 5-9h -- sharp and comparatively short-lived
};

// The regime's own contribution to a single ambient-drift tick (drift.ts
// ticks every 15 minutes -- see DRIFT_INTERVAL_MINUTES there). "The market"
// leans up during bull and down during bear. Bear's magnitude is larger
// than bull's ("elevator down, stairs up"), matching how real corrections
// tend to move faster than rallies, even though bull runs win out over the
// term by simply lasting longer and being picked more often.
//
// These are per-3-minute-tick values (DRIFT_INTERVAL_MINUTES in drift.ts).
// Bias accumulates roughly additively across ticks, so going from 15-minute
// to 3-minute ticks (5x as many per hour) means dividing each tick's bias by
// 5 to leave the market's actual hourly trend unchanged -- the market moves
// the same amount per hour, just sampled far more finely.
export const REGIME_BIAS: Record<MarketRegime, number> = {
  bull: 0.0005,
  bear: -0.0009,
  neutral: 0,
};

// Applied per company, independent of the regime bias above and of every
// other company -- real individual stocks don't all move in lockstep with
// "the market," even on a day the index is clearly up or down. This is
// deliberately comparable in size to the regime bias itself so a
// meaningful share of companies buck the overall trend on any given tick,
// not just a token few.
//
// Scaled by sqrt of the tick-rate change, not the rate itself -- noise
// (unlike bias) accumulates like a random walk, where variance rather than
// magnitude adds across ticks. Going from 15- to 3-minute ticks is 5x as
// many, so each tick's range shrinks by sqrt(5) ~= 2.24 to keep the same net
// hourly volatility. Dividing by 5 instead would quietly make every stock
// much calmer, which is exactly the "boring flat line" this change is
// meant to fix.
export const IDIOSYNCRATIC_DRIFT_RANGE: [number, number] = [-0.0056, 0.0056];

function randomRegimeDurationMs(regime: MarketRegime): number {
  const [min, max] = REGIME_DURATION_MINUTES[regime];
  const minutes = min + Math.random() * (max - min);
  return minutes * 60_000;
}

// The goal is "most money after 5 days," so the market needs to actually be
// beatable -- picking the next regime uniformly among bull/bear/neutral
// would give the whole term close to zero net drift, which makes staying
// invested a coin flip rather than something a reasonably engaged,
// diversified student is likely to come out ahead on. Weighting the pick
// toward bull means the term spends more of its time trending up than down
// -- bear runs still happen and still sting, but the market leans bullish
// overall.
const REGIME_WEIGHTS: Record<MarketRegime, number> = {
  bull: 0.45,
  neutral: 0.35,
  bear: 0.2,
};

function pickNextRegime(current: MarketRegime): MarketRegime {
  const options = (["bull", "bear", "neutral"] as const).filter((r) => r !== current);
  const totalWeight = options.reduce((sum, r) => sum + REGIME_WEIGHTS[r], 0);
  let roll = Math.random() * totalWeight;
  for (const r of options) {
    roll -= REGIME_WEIGHTS[r];
    if (roll <= 0) return r;
  }
  return options[options.length - 1]!;
}

/**
 * Returns the currently active market regime plus when it started/ends,
 * opportunistically rotating to a new one (with a fresh random duration) if
 * the current one has expired. Called from applyAmbientDrift(), same "tick
 * whenever someone's looking" model -- no dedicated timer/worker needed.
 */
export async function getRegimeStatus(): Promise<RegimeStatus> {
  const [row] = await db.select().from(gameSettings).where(eq(gameSettings.id, 1)).limit(1);
  const now = new Date();
  if (!row) return { regime: "neutral", startedAt: now, endsAt: now };

  if (row.regimeEndsAt.getTime() > now.getTime()) {
    return { regime: row.marketRegime, startedAt: row.regimeStartedAt, endsAt: row.regimeEndsAt };
  }

  const next = pickNextRegime(row.marketRegime);
  const endsAt = new Date(now.getTime() + randomRegimeDurationMs(next));
  await db
    .update(gameSettings)
    .set({ marketRegime: next, regimeStartedAt: now, regimeEndsAt: endsAt })
    .where(eq(gameSettings.id, 1));

  return { regime: next, startedAt: now, endsAt };
}

/** Convenience wrapper for callers (ambient drift) that only need the regime itself. */
export async function getMarketRegime(): Promise<MarketRegime> {
  return (await getRegimeStatus()).regime;
}

/** One stretch of market history: this regime was active up until `untilMs`. */
export interface RegimeSegment {
  untilMs: number;
  regime: MarketRegime;
}

// A backfill spans at most MAX_CATCHUP_TICKS (drift.ts) = 72 hours, and the
// shortest regime runs 5 hours, so ~15 segments is the realistic worst case.
// The cap only exists so a bad clock can't spin this loop forever.
const MAX_TIMELINE_SEGMENTS = 64;

/**
 * Builds the sequence of regimes covering [fromMs, now], so a catch-up
 * backfill can move through changing market conditions instead of applying
 * one bias to the whole gap.
 *
 * This matters far more than it sounds. Ambient drift used to read the
 * regime once and reuse that single bias for every backfilled tick, so the
 * first page load after a quiet stretch replayed the entire gap under one
 * unbroken trend. Simulated with this codebase's own numbers, a 60-hour
 * weekend gap on a volatility-2.5 company landed at 6% of its pre-gap price
 * under bear and 437% under bull -- the whole market's fate for the weekend
 * decided by one coin flip the moment a student opened the dashboard on
 * Monday. Rotating through regimes the way the 72 hours actually would have
 * makes both tails collapse toward a normal-looking few days of trading.
 *
 * Everything at or after the live regime's start uses the real persisted
 * regime; earlier stretches are invented by walking backwards with the same
 * weighted pick and duration ranges a live rotation would have used. That
 * history is synthetic either way -- nobody was watching -- so the goal is
 * only that it be plausible and self-consistent.
 *
 * Build this ONCE per drift pass and share it across companies: the regime
 * is market-wide, so two companies backfilling the same minute must agree on
 * what the market was doing.
 */
export function buildRegimeTimeline(
  fromMs: number,
  nowMs: number,
  current: RegimeStatus
): RegimeSegment[] {
  // The live regime covers from when it started through now (and beyond --
  // Infinity means "any tick at or after this point", which also absorbs
  // clock skew that puts a tick marginally past now).
  const segments: RegimeSegment[] = [{ untilMs: Number.POSITIVE_INFINITY, regime: current.regime }];

  let cursor = Math.min(current.startedAt.getTime(), nowMs);
  let regime = current.regime;

  for (let i = 0; cursor > fromMs && i < MAX_TIMELINE_SEGMENTS; i++) {
    // pickNextRegime just means "a different regime, weighted" -- equally
    // sensible run backwards as forwards.
    const previous = pickNextRegime(regime);
    segments.unshift({ untilMs: cursor, regime: previous });
    cursor -= randomRegimeDurationMs(previous);
    regime = previous;
  }

  return segments;
}

/**
 * Admin/teacher override -- forces the market straight into the given
 * regime right now, for however long they specify (or that regime's normal
 * average duration if they don't). Bypasses the usual random pick/duration
 * entirely; the next *natural* rotation after this one still goes through
 * the normal weighted pick.
 */
export async function setRegime(regime: MarketRegime, durationMinutes?: number): Promise<RegimeStatus> {
  const now = new Date();
  const [min, max] = REGIME_DURATION_MINUTES[regime];
  const minutes = durationMinutes && durationMinutes > 0 ? durationMinutes : (min + max) / 2;
  const endsAt = new Date(now.getTime() + minutes * 60_000);

  await db
    .update(gameSettings)
    .set({ marketRegime: regime, regimeStartedAt: now, regimeEndsAt: endsAt })
    .where(eq(gameSettings.id, 1));

  return { regime, startedAt: now, endsAt };
}
