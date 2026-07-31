import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gameSettings } from "@/lib/db/schema";

export type MarketRegime = "bull" | "bear" | "neutral";

// ~12 hours on average (10-14h spread) so a 5-day term sees roughly 8-10
// regime changes -- a handful of multi-hour bull/bear stretches rather
// than a new mood every trading period.
const MIN_REGIME_MINUTES = 10 * 60;
const MAX_REGIME_MINUTES = 14 * 60;

// Ambient drift's random range is skewed by whichever regime is active --
// still noisy day to day, but leaning up during a bull run and down during
// a bear run, instead of pure mean-zero noise that never actually trends.
export const REGIME_DRIFT_RANGE: Record<MarketRegime, [number, number]> = {
  bull: [-0.005, 0.03],
  bear: [-0.03, 0.005],
  neutral: [-0.02, 0.02],
};

function randomRegimeDurationMs(): number {
  const minutes = MIN_REGIME_MINUTES + Math.random() * (MAX_REGIME_MINUTES - MIN_REGIME_MINUTES);
  return minutes * 60_000;
}

// The goal is "most money after 5 days," so the market needs to actually be
// beatable -- picking the next regime uniformly among bull/bear/neutral
// gives the whole term zero net drift (bull's average tick and bear's
// average tick are equal and opposite, see REGIME_DRIFT_RANGE above), which
// makes staying invested a coin flip rather than something a reasonably
// engaged, diversified student is likely to come out ahead on. Weighting
// the pick toward bull (without touching how strong any single regime
// feels) means the term spends more of its time trending up than down --
// bear runs still happen and still sting, but the market leans bullish
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
 * Returns the currently active market regime, opportunistically rotating
 * to a new one (with a fresh random duration) if the current one has
 * expired. Called from applyAmbientDrift(), same "tick whenever someone's
 * looking" model -- no dedicated timer/worker needed.
 */
export async function getMarketRegime(): Promise<MarketRegime> {
  const [row] = await db.select().from(gameSettings).where(eq(gameSettings.id, 1)).limit(1);
  if (!row) return "neutral";

  const now = new Date();
  if (row.regimeEndsAt.getTime() > now.getTime()) {
    return row.marketRegime;
  }

  const next = pickNextRegime(row.marketRegime);
  const endsAt = new Date(now.getTime() + randomRegimeDurationMs());
  await db
    .update(gameSettings)
    .set({ marketRegime: next, regimeEndsAt: endsAt })
    .where(eq(gameSettings.id, 1));

  return next;
}
