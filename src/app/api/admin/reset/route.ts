import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { resetGame } from "@/lib/services/admin";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  await resetGame();
  return NextResponse.json({ ok: true });
}
