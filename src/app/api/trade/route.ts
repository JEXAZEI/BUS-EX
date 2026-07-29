import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tradeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
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
  // companyId/side/shares are sent, and execute_trade recomputes the real
  // price server-side from the live AMM pool inside a locked transaction.
  const { data, error } = await supabase.rpc("execute_trade", {
    p_company_id: companyId,
    p_side: side,
    p_shares: shares,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, result });
}
