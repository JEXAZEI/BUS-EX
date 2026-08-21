import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { resetGame } from "@/lib/services/admin";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // The most destructive action in the app -- a legitimate reset happens
  // once per term, so this stays tight even though other admin routes are
  // generous.
  if (!(await checkAndRecordRateLimit(profile.id, "admin-reset", 60, 5))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  await resetGame();
  return NextResponse.json({ ok: true });
}
