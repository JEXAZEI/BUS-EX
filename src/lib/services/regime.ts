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

function pickNextRegime(current: MarketRegime): MarketRegime {
  const options = (["bull", "bear", "neutral"] as const).filter((r) => r !== current);
  return options[Math.floor(Math.random() * options.length)]!;
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
