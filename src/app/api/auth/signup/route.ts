import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema, synthesizeStudentEmail } from "@/lib/validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;
  const adminEmail = parsed.data.adminEmail?.trim() || null;
  const admin = createAdminClient();

  const { data: available, error: availabilityError } = await admin.rpc(
    "is_username_available",
    { p_username: username }
  );
  if (availabilityError) {
    console.error("Username availability check failed:", availabilityError.message);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  if (!available) {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }

  const email = adminEmail || synthesizeStudentEmail(username);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (createError || !created.user) {
    console.error("Signup failed:", createError?.message);
    const message = createError?.message?.includes("already been registered")
      ? "That email is already registered. Try logging in instead."
      : "Could not create your account. That username may already be taken.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  // Sign the new user in immediately so they land in a real session --
  // this goes through the same cookie-writing server client used
  // everywhere else, so the session cookie is httpOnly/secure/sameSite.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("Post-signup sign-in failed:", signInError.message);
    return NextResponse.json(
      { error: "Account created. Please log in." },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
