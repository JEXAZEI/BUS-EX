import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Hit on a schedule by Vercel Cron (see vercel.json) to fire a random
// market event automatically, satisfying "periodically, on a timer" from
// the spec, in addition to the teacher's manual trigger button in /admin.
// Protected by a shared secret rather than a user session, since Vercel
// Cron requests carry no browser cookies.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("trigger_market_event_system", {
    p_template_id: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventId: data });
}
