import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { runMarketEvent, EventError } from "@/lib/services/events";

const schema = z.object({ templateId: z.string().uuid().nullable().optional() });

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine -- means "pick a random template".
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const eventId = await runMarketEvent(parsed.data.templateId ?? null, profile.id);
    return NextResponse.json({ ok: true, eventId });
  } catch (err) {
    if (err instanceof EventError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Event trigger failed:", err);
    return NextResponse.json({ error: "Failed to trigger event" }, { status: 500 });
  }
}
