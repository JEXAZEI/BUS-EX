import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { deleteUser } from "@/lib/services/users";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

const schema = z.object({ userId: z.string().uuid() });

// Owner-only. Permanently deletes the user; holdings/trades/sessions
// cascade-delete via foreign keys. Prefer /deactivate for routine "a
// student dropped the class" cases -- this can't be undone.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  // Permanent and irreversible, unlike /deactivate -- kept tighter.
  if (!(await checkAndRecordRateLimit(profile.id, "admin-users-delete", 60, 10))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
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
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  await deleteUser(parsed.data.userId);
  return NextResponse.json({ ok: true });
}
