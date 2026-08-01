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
const REGIME_DURATION_MINUTES: Record<MarketRegime, [number, number]> = {
  bull: [14 * 60, 20 * 60], // 14-20h -- a long, grinding run
  neutral: [8 * 60, 12 * 60], // 8-12h
  bear: [5 * 60, 9 * 60], // 5-9h -- sharp and comparatively short-lived
};

// The regime's own contribution to ambient drift is a single shared bias
// per tick, not a wide range -- "the market" leans up during bull and down
// during bear. Bear's magnitude is larger than bull's ("elevator down,
// stairs up"), matching how real corrections tend to move faster than
// rallies, even though bull runs win out over the term by simply lasting
// longer and being picked more often.
export const REGIME_BIAS: Record<MarketRegime, number> = {
  bull: 0.01,
  bear: -0.018,
  neutral: 0,
};

// Applied per company, independent of the regime bias above and of every
// other company -- real individual stocks don't all move in lockstep with
// "the market," even on a day the index is clearly up or down. This is
// deliberately comparable in size to the regime bias itself so a
// meaningful share of companies buck the overall trend on any given tick,
// not just a token few.
export const IDIOSYNCRATIC_DRIFT_RANGE: [number, number] = [-0.025, 0.025];

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
