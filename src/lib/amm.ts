/**
 * Client-side preview math only, mirroring `executeTrade` in
 * src/lib/services/trades.ts. This is used to show the user an estimated
 * cost/proceeds before they submit an order. It is NEVER trusted as the
 * actual trade price -- the server always recomputes the real price from the
 * live pool state inside the DB transaction, so a stale or manipulated
 * client-side estimate can't cause an unexpected trade.
 *
 * It has to mirror the server's *rounding*, not just its formula. The server
 * quantizes the share quantity to 4 dp, prices off the constant product, and
 * then rounds cash against the trader -- up when they pay, down when they're
 * paid (see the note on `k` in trades.ts for why). Rounding to nearest here
 * instead quoted a cost a cent below what was actually charged, which is a
 * small thing to see on a confirmation screen and an easy one to avoid.
 */
export function previewTrade(
  poolCash: number,
  poolShares: number,
  side: "buy" | "sell",
  requestedShares: number
): { cashAmount: number; pricePerShare: number; newSpotPrice: number } | null {
  // Matches SHARE_DECIMALS in trades.ts -- every share column is numeric(18,4).
  const shares = round4(requestedShares);
  if (shares <= 0) return null;
  const k = poolCash * poolShares;

  let newPoolShares: number;
  let cashAmount: number;

  if (side === "buy") {
    newPoolShares = round4(poolShares - shares);
    if (newPoolShares <= 0) return null;
    const fairCost = k / newPoolShares - poolCash;
    // Matches MIN_TRADE_VALUE in trades.ts: under a cent of value is refused
    // rather than billed up to a cent.
    if (fairCost < 0.01) return null;
    cashAmount = cashCeil(fairCost);
  } else {
    newPoolShares = round4(poolShares + shares);
    const fairProceeds = poolCash - k / newPoolShares;
    if (fairProceeds < 0.01) return null;
    cashAmount = cashFloor(fairProceeds);
  }

  // The server moves the pool by exactly the cash that changes hands, so the
  // resulting spot price has to be derived the same way here.
  const newPoolCash = side === "buy" ? poolCash + cashAmount : poolCash - cashAmount;

  return {
    cashAmount,
    pricePerShare: round4(cashAmount / shares),
    newSpotPrice: round4(newPoolCash / newPoolShares),
  };
}

function cashCeil(n: number) {
  return Math.ceil(n * 100) / 100;
}

function cashFloor(n: number) {
  return Math.floor(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
