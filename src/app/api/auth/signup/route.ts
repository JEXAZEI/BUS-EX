import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation";
import { signupUser, SignupError } from "@/lib/services/auth";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db/errors";
import { checkAndRecordRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  // By IP, not username -- there's no account yet to key on. The cap is
  // deliberately very loose because school WiFi NATs an entire class (often
  // several classes) behind one public IP, so a normal day-one signup rush
  // looks identical to an attack from the server's point of view. The cost
  // asymmetry decides it: blocking a script is a small win, while locking a
  // real class out mid-period is a genuine failure. 200/10min still stops a
  // runaway script (which would attempt orders of magnitude more) while
  // clearing any realistic classroom, including overlapping periods.
  const ip = getClientIp(request);
  if (!(await checkAndRecordRateLimit(ip, "signup", 10 * 60, 200))) {
    return NextResponse.json(
      { error: "Too many signups from this network. Try again in a few minutes." },
      { status: 429 }
    );
  }

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

  const { username, fullName, email, password } = parsed.data;

  try {
    const user = await signupUser({ username, fullName, email, password });
    const token = await createSession(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof SignupError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Unique constraint race (two signups for the same username at once).
    // Race fallback: signupUser already checks both, so reaching here means a
    // simultaneous signup claimed the username or the email between that
    // check and the insert. The database doesn't tell us which cheaply, so the
    // message covers both.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That username or email is already taken" },
        { status: 409 }
      );
    }
    console.error("Signup failed:", err);
    return NextResponse.json({ error: "Could not create your account. Try again." }, { status: 500 });
  }
}
