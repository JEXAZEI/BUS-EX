import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({ userId: z.string().uuid(), active: z.boolean() });

// Owner-only. Soft "remove" -- disables login/trading but preserves trade
// history for grading/audit. Uses the service-role key, so the caller's
// role is checked explicitly here rather than relying on RLS.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (parsed.data.userId === profile.id) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: parsed.data.active })
    .eq("id", parsed.data.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
