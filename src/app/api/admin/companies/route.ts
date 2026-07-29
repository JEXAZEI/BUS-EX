import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { companyUpsertSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const supabase = await createClient();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = companyUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const c = parsed.data;

  // admin_upsert_company itself checks is_admin() and rejects non-admins --
  // this route just forwards the call, the DB is the real authority.
  const { data, error } = await supabase.rpc("admin_upsert_company", {
    p_id: c.id,
    p_name: c.name,
    p_ticker: c.ticker,
    p_description: c.description ?? "",
    p_sector: c.sector,
    p_starting_pool_cash: c.startingPoolCash,
    p_starting_pool_shares: c.startingPoolShares,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}
