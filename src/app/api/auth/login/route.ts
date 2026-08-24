import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { checkLoginRateLimit, recordLoginAttempt, getClientIdentifier } from "@/lib/rateLimit";
import { findUserByIdentifier } from "@/lib/services/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";

// Deliberately identical for "no such account" and "wrong password", so the
// response can't be used to discover which usernames or emails exist.
const GENERIC_ERROR = "Invalid login or password";

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
  const { identifier: loginId, password } = parsed.data;
  const identifier = getClientIdentifier(request, loginId);

  const rateLimit = await checkLoginRateLimit(identifier);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const user = await findUserByIdentifier(loginId);
  if (!user) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!user.isActive) {
    await recordLoginAttempt(identifier, false);
    return NextResponse.json(
      { error: "This account has been disabled. Contact your teacher." },
      { status: 403 }
    );
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);
  await recordLoginAttempt(identifier, true);

  return NextResponse.json({ ok: true }, { status: 200 });
}
