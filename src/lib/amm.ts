/**
 * Client-side preview math only, mirroring the constant-product (x*y=k)
 * formula used by the `execute_trade` Postgres function. This is used to
 * show the user an estimated cost/proceeds before they submit an order.
 * It is NEVER trusted as the actual trade price -- the server always
 * recomputes the real price from the live pool state inside the DB
 * transaction, so a stale or manipulated client-side estimate can't cause
 * an unexpected trade.
 */
export function previewTrade(
  poolCash: number,
  poolShares: number,
  side: "buy" | "sell",
  shares: number
): { cashAmount: number; pricePerShare: number; newSpotPrice: number } | null {
  if (shares <= 0) return null;
  const k = poolCash * poolShares;

  if (side === "buy") {
    const newPoolShares = poolShares - shares;
    if (newPoolShares <= 0) return null;
    const newPoolCash = k / newPoolShares;
    const cashAmount = newPoolCash - poolCash;
    return {
      cashAmount: round2(cashAmount),
      pricePerShare: round4(cashAmount / shares),
      newSpotPrice: round4(newPoolCash / newPoolShares),
    };
  }

  const newPoolShares = poolShares + shares;
  const newPoolCash = k / newPoolShares;
  const cashAmount = poolCash - newPoolCash;
  if (cashAmount <= 0) return null;
  return {
    cashAmount: round2(cashAmount),
    pricePerShare: round4(cashAmount / shares),
    newSpotPrice: round4(newPoolCash / newPoolShares),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
