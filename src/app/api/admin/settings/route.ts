import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { adminSetStartingCash, AdminError } from "@/lib/services/admin";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

// Minimum of 1, not just "positive": the column is numeric(14,2), so
// anything under half a cent stores as 0.00 and leaves every student unable
// to trade. adminSetStartingCash enforces the same bound.
const schema = z.object({
  startingCash: z
    .number()
    .min(1, "Starting cash must be at least $1")
    .max(10_000_000, "Starting cash must be at most $10,000,000"),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-settings", 60, 30))) {
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
    // Surface the specific rule, matching the other admin routes -- "must be
    // at least $1" tells a teacher what to type next; "Invalid input" doesn't.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    await adminSetStartingCash(parsed.data.startingCash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
