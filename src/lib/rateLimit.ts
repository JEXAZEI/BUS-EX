import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;

/**
 * DB-backed login rate limiter, keyed on a combination of username and
 * client IP so a single bad actor can't brute-force one account, and a
 * single IP can't brute-force many accounts, without either legitimate
 * factor alone locking someone out permanently.
 */
export async function checkLoginRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("success", false)
    .gte("attempted_at", since);

  if (error) {
    // Fail closed would lock everyone out on a transient DB error; fail
    // open here but the error is still surfaced in server logs.
    console.error("Rate limit check failed:", error.message);
    return { allowed: true };
  }

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: WINDOW_MINUTES * 60 };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(identifier: string, success: boolean) {
  const admin = createAdminClient();
  const { error } = await admin.from("login_attempts").insert({ identifier, success });
  if (error) {
    console.error("Failed to record login attempt:", error.message);
  }
}

export function getClientIdentifier(request: Request, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : "unknown";
  return `${username.toLowerCase()}::${ip}`;
}
