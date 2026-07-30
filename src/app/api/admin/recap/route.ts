import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { getTermRecap } from "@/lib/services/recap";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const recap = await getTermRecap();
  return NextResponse.json({ recap });
}
