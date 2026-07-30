import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/session";
import { resetUserPassword } from "@/lib/services/users";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({ userId: z.string().uuid(), newPassword: passwordSchema });

// Owner-only. Directly sets a user's password hash, bypassing the normal
// login flow -- the caller's role is checked explicitly here.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
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

  await resetUserPassword(parsed.data.userId, parsed.data.newPassword);
  return NextResponse.json({ ok: true });
}
