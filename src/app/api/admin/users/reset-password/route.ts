import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import {
  resetUserPassword,
  PasswordPolicyError,
  ResetNotPermittedError,
} from "@/lib/services/users";
import { passwordSchema } from "@/lib/validation";
import { checkAndRecordRateLimit } from "@/lib/rateLimit";

const schema = z.object({ userId: z.string().uuid(), newPassword: passwordSchema });

// Teachers and owners. Directly sets a user's password hash, bypassing the
// normal login flow -- the caller's role is checked explicitly here, and
// resetUserPassword additionally enforces that a teacher may only reset a
// *student*, since resetting staff would be a route to owner takeover.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || (profile.role !== "teacher" && profile.role !== "owner")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!(await checkAndRecordRateLimit(profile.id, "admin-users-reset-password", 60, 20))) {
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    await resetUserPassword(parsed.data.userId, parsed.data.newPassword, profile.role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ResetNotPermittedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof PasswordPolicyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Password reset failed:", err);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
