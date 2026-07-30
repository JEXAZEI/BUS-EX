import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { tradeSchema } from "@/lib/validation";
import { executeTrade, TradeError } from "@/lib/services/trades";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = tradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid trade" },
      { status: 400 }
    );
  }

  const { companyId, side, shares } = parsed.data;

  // The client-submitted price/estimate (if any) is never trusted -- only
  // companyId/side/shares are sent, and executeTrade recomputes the real
  // price server-side from the live AMM pool inside a locked transaction.
  try {
    const result = await executeTrade(profile.id, companyId, side, shares);
    return NextResponse.json({
      ok: true,
      result: {
        cash_amount: result.cashAmount,
        price_per_share: result.pricePerShare,
        new_spot_price: result.newSpotPrice,
        new_cash_balance: result.newCashBalance,
        new_holding_shares: result.newHoldingShares,
      },
    });
  } catch (err) {
    if (err instanceof TradeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Trade failed:", err);
    return NextResponse.json({ error: "Trade failed. Try again." }, { status: 500 });
  }
}
