import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { updateOwnNameSchema } from "@/lib/validation";
import { changeOwnFullName } from "@/lib/services/users";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

// Self-service rename. Scoped to the caller's own id from the session --
// there's deliberately no userId in the body, so this route can't be pointed
// at another account no matter what's posted.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateOwnNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid name" },
      { status: 400 }
    );
  }

  // Deliberately after validation, so only real changes count against the
  // budget. Checking first meant a student fumbling the name format ("Bob
  // 123") burned an attempt on every rejection and could lock themselves out
  // of fixing their own typo -- the limit is here to stop someone cycling
  // their leaderboard name, not to punish getting the format wrong.
  if (!(await checkAndRecordRateLimit(profile.id, "profile-name", 60 * 60, 10))) {
    return NextResponse.json(
      { error: "You've changed your name a few times just now. Try again later." },
      { status: 429 }
    );
  }

  try {
    await changeOwnFullName(profile.id, parsed.data.fullName);
    return NextResponse.json({ ok: true, fullName: parsed.data.fullName });
  } catch (err) {
    console.error("Name update failed:", err);
    return NextResponse.json({ error: "Could not update your name" }, { status: 500 });
  }
}
