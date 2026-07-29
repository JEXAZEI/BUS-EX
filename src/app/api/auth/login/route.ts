import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema } from "@/lib/validation";
import { checkLoginRateLimit, recordLoginAttempt, getClientIdentifier } from "@/lib/rateLimit";

const GENERIC_ERROR = "Invalid username or password";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const { username, password } = parsed.data;
  const identifier = getClientIdentifier(request, username);

  const rateLimit = await checkLoginRateLimit(identifier);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id, is_active")
    .ilike("username", username)
    .maybeSingle();

  if (!profileRow) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const { data: authUser, error: getUserError } = await admin.auth.admin.getUserById(
    profileRow.id
  );
  if (getUserError || !authUser.user?.email) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });

  if (signInError) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!profileRow.is_active) {
    await supabase.auth.signOut();
    await recordLoginAttempt(identifier, false);
    return NextResponse.json(
      { error: "This account has been disabled. Contact your teacher." },
      { status: 403 }
    );
  }

  await recordLoginAttempt(identifier, true);
  return NextResponse.json({ ok: true }, { status: 200 });
}
