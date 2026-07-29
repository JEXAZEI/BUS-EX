import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordSchema } from "@/lib/validation";
import { z } from "zod";

const schema = z.object({ userId: z.string().uuid(), newPassword: passwordSchema });

// Owner-only. This uses the service-role key to directly set a user's auth
// password, which bypasses RLS/Postgres-level checks entirely -- so this
// route must independently verify the caller's role itself before doing
// anything, rather than relying on a database policy.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") {
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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
