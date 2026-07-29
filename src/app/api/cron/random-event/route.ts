import { NextResponse } from "next/server";
import { runMarketEvent, EventError } from "@/lib/services/events";

// Hit on a schedule by Vercel Cron (see vercel.json) to fire a random
// market event automatically, satisfying "periodically, on a timer" from
// the spec, in addition to the teacher's manual trigger button in /admin.
// Protected by a shared secret rather than a user session, since Vercel
// Cron requests carry no browser cookies. triggeredBy is null so the event
// feed reads as "the market" rather than any specific person.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 501 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const eventId = await runMarketEvent(null, null);
    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    if (err instanceof EventError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Scheduled event failed:", err);
    return NextResponse.json({ error: "Failed to trigger event" }, { status: 500 });
  }
}
