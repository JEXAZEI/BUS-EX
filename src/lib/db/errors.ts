/**
 * True if `err` is (or wraps) a Postgres unique-constraint violation
 * (SQLSTATE 23505). Drizzle's query builder wraps the underlying `pg`
 * driver error in a DrizzleQueryError, which puts the real error --
 * including `.code` -- on `.cause` rather than on itself, so a plain
 * `"code" in err` check on the caught error silently never matches and
 * falls through to a generic 500 instead of the intended friendly message.
 * Checks both the error itself and its `.cause` to be safe either way.
 */
export function isUniqueViolation(err: unknown): boolean {
  const hasCode23505 = (e: unknown): boolean =>
    e instanceof Error && "code" in e && (e as { code?: unknown }).code === "23505";

  if (hasCode23505(err)) return true;
  const cause = err instanceof Error ? err.cause : undefined;
  return hasCode23505(cause);
}
