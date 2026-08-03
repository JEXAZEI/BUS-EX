import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation";
import { signupUser, SignupError } from "@/lib/services/auth";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db/errors";

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

  try {
    const user = await signupUser(username, password);
    const token = await createSession(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Unique constraint race (two signups for the same username at once).
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
    console.error("Signup failed:", err);
    return NextResponse.json({ error: "Could not create your account. Try again." }, { status: 500 });
  }
}
