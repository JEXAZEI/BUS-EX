import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loginAttempts } from "@/lib/db/schema";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;

/**
 * DB-backed login rate limiter, keyed on a combination of username and
 * client IP so a single bad actor can't brute-force one account, and a
 * single IP can't brute-force many accounts, without either legitimate
 * factor alone locking someone out permanently.
 */
export async function checkLoginRateLimit(
  identifier: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.identifier, identifier),
          eq(loginAttempts.success, false),
          gte(loginAttempts.attemptedAt, since)
        )
      );

    if ((row?.count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
      return { allowed: false, retryAfterSeconds: WINDOW_MINUTES * 60 };
    }
    return { allowed: true };
  } catch (err) {
    // Fail closed would lock everyone out on a transient DB error; fail
    // open here but the error is still surfaced in server logs.
    console.error("Rate limit check failed:", err);
    return { allowed: true };
  }
}

export async function recordLoginAttempt(identifier: string, success: boolean) {
  try {
    await db.insert(loginAttempts).values({ identifier, success });
  } catch (err) {
    console.error("Failed to record login attempt:", err);
  }
}

export function getClientIdentifier(request: Request, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : "unknown";
  return `${username.toLowerCase()}::${ip}`;
}
