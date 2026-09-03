import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiHits, loginAttempts, trades } from "@/lib/db/schema";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;

/**
 * Per-IP ceiling across *all* accounts, so one machine can't work through
 * the roster five guesses at a time. Deliberately generous: a class shares
 * one school IP, so 30 students each fumbling their password twice at the
 * start of a period is normal traffic, not an attack. 200 failures in 15
 * minutes is far above anything a room full of people types by hand and far
 * below what a script needs to be useful.
 */
const MAX_ATTEMPTS_PER_IP = 200;

/** Marks the per-IP counter rows, which share the login_attempts table. */
const IP_SCOPE_PREFIX = "ip-scope::";

function ipScopeKey(ip: string): string {
  return `${IP_SCOPE_PREFIX}${ip}`;
}

async function countRecentFailures(identifier: string, since: Date): Promise<number> {
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
  return row?.count ?? 0;
}

/**
 * DB-backed login rate limiter with two independent ceilings: at most
 * MAX_ATTEMPTS_PER_WINDOW failures against one account from one IP, and at
 * most MAX_ATTEMPTS_PER_IP failures from that IP against any account. The
 * first stops someone grinding on a single account; the second stops them
 * side-stepping it by rotating through the roster, since each new account
 * would otherwise start with a fresh budget.
 *
 * Both counters live in login_attempts, distinguished by the shape of their
 * identifier (`username::ip` vs. `ip-scope::ip`), so neither needs its own
 * table or a schema change.
 */
export async function checkLoginRateLimit(
  identifier: string,
  ip: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  try {
    const [perAccount, perIp] = await Promise.all([
      countRecentFailures(identifier, since),
      countRecentFailures(ipScopeKey(ip), since),
    ]);

    if (perAccount >= MAX_ATTEMPTS_PER_WINDOW || perIp >= MAX_ATTEMPTS_PER_IP) {
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

/**
 * Records one attempt against both counters checkLoginRateLimit reads. Only
 * failures need the per-IP row -- a successful login is not evidence of
 * anything -- so the extra write never happens on the common path.
 */
export async function recordLoginAttempt(identifier: string, success: boolean, ip?: string) {
  try {
    const rows = [{ identifier, success }];
    if (!success && ip) rows.push({ identifier: ipScopeKey(ip), success });
    await db.insert(loginAttempts).values(rows);
  } catch (err) {
    console.error("Failed to record login attempt:", err);
  }
}

export function getClientIdentifier(request: Request, username: string): string {
  return `${username.toLowerCase()}::${getClientIp(request)}`;
}

const TRADE_WINDOW_SECONDS = 10;
const MAX_TRADES_PER_WINDOW = 10;

/**
 * Simple per-user trade throttle. This is a closed classroom, not a public
 * API, so the goal isn't stopping a determined attacker -- it's blunting an
 * accidental double-submit or a careless script hammering the endpoint.
 * Counts already-committed trades in the window instead of a separate
 * attempts log, since every successful trade is already recorded in
 * `trades`.
 */
export async function checkTradeRateLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - TRADE_WINDOW_SECONDS * 1000);
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trades)
      .where(and(eq(trades.userId, userId), gte(trades.createdAt, since)));
    return (row?.count ?? 0) < MAX_TRADES_PER_WINDOW;
  } catch (err) {
    console.error("Trade rate limit check failed:", err);
    return true;
  }
}

/**
 * General-purpose rate limiter for any route: caps a given identifier to
 * `maxRequests` allowed calls per `windowSeconds`, logging one row per
 * *allowed* request to api_hits. Unlike checkTradeRateLimit (which counts
 * an existing table trades already writes to), most routes don't have a
 * natural table to count against, so this keeps its own log. Fails open on
 * a DB error for the same reason checkLoginRateLimit does -- a transient
 * outage shouldn't lock everyone out of the whole app.
 */
export async function checkAndRecordRateLimit(
  identifier: string,
  route: string,
  windowSeconds: number,
  maxRequests: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiHits)
      .where(and(eq(apiHits.identifier, identifier), eq(apiHits.route, route), gte(apiHits.createdAt, since)));

    if ((row?.count ?? 0) >= maxRequests) return false;

    await db.insert(apiHits).values({ identifier, route });
    return true;
  } catch (err) {
    console.error(`Rate limit check failed for ${route}:`, err);
    return true;
  }
}

/**
 * Client IP for rate-limiting routes with no session yet (e.g. signup), and
 * the IP half of every login rate-limit key.
 *
 * The source matters: `x-forwarded-for` is a list that a proxy *appends* to,
 * so its first entry is whatever the client sent. Reading that entry -- which
 * this used to do -- hands the client control of its own rate-limit bucket:
 * sending a different X-Forwarded-For on each request gets a fresh budget
 * every time, which defeats the login limiter entirely. That was verified
 * against this app: after five failures locked an account out, six requests
 * with rotating X-Forwarded-For values were all let straight through.
 *
 * So, in order:
 *  1. `x-vercel-forwarded-for` -- set by Vercel's edge, which overwrites any
 *     copy the client sends, so it can't be forged in production.
 *  2. `x-real-ip` -- same idea, and what most reverse proxies set.
 *  3. the LAST entry of `x-forwarded-for` -- the hop appended by the nearest
 *     trusted proxy, rather than the first, which is the client's to choose.
 *
 * With no proxy at all (local dev) every header is absent and everything
 * shares the "unknown" bucket, which is correct for a single-machine setup.
 */
export function getClientIp(request: Request): string {
  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelIp) return vercelIp.split(",")[0]!.trim();

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }

  return "unknown";
}
