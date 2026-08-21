import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getCurrentProfile } from "@/lib/session";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { toMarketEvent } from "@/lib/db/mappers";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Same reasoning as /api/companies/prices -- polled every 20s, this cap
  // is well above normal use.
  if (!(await checkAndRecordRateLimit(profile.id, "events-recent", 60, 40))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const rows = await db.select().from(events).orderBy(desc(events.createdAt)).limit(20);
  return NextResponse.json({ events: rows.map(toMarketEvent) });
}
