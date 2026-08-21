import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { setUserActive } from "@/lib/services/users";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

const schema = z.object({ userId: z.string().uuid(), active: z.boolean() });

// Owner-only. Soft "remove" -- disables login/trading but preserves trade
// history for grading/audit.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-users-deactivate", 60, 30))) {
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
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  await setUserActive(parsed.data.userId, parsed.data.active);
  return NextResponse.json({ ok: true });
}
