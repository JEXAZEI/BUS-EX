import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { getTermRecap } from "@/lib/services/recap";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-recap", 60, 20))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const recap = await getTermRecap();
  return NextResponse.json({ recap });
}
