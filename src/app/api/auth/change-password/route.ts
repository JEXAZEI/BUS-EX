import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { passwordSchema } from "@/lib/validation";
import { changeOwnPassword, ChangePasswordError } from "@/lib/services/users";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: passwordSchema,
});

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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Deliberately after validation, like the name route. The limit exists to
  // stop someone guessing the current password on an unattended laptop, and
  // only requests that reach that check are guesses. Checking first meant a
  // student whose new password kept hitting the denylist ("student123",
  // "changeme") burned the whole budget on rejections and was locked out of
  // changing their password for 15 minutes without a single wrong guess.
  if (!(await checkAndRecordRateLimit(profile.id, "change-password", 15 * 60, 5))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  try {
    await changeOwnPassword(profile.id, parsed.data.currentPassword, parsed.data.newPassword);
    // changeOwnPassword revokes every session for this account (including
    // the one this request just used), so issue a fresh one for the
    // current device -- otherwise the user would be logged out by the
    // password change they just made.
    const token = await createSession(profile.id);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ChangePasswordError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Change password failed:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
