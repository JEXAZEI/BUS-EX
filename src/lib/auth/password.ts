import "server-only";
import bcrypt from "bcryptjs";

// bcrypt truncates input at 72 bytes; passwordSchema in validation.ts
// already caps password length well under that.
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A real 12-round hash of a random string that was never recorded, so nothing
// can ever verify against it. Its only job is to cost the same ~350ms a real
// comparison does -- see burnPasswordComparison below.
const DUMMY_HASH = "$2a$12$XaVKfCHFxmWGVRNRh1RkGefatqhAKG/wesbKPnSyFqTDXZAONzyMy";

/**
 * Spends the same CPU a real password check would, and throws the result
 * away. Called on the "no such account" path at login so that path takes as
 * long as the "wrong password" path.
 *
 * Without it the two are trivially distinguishable -- measured on this
 * codebase, a miss returned in ~13ms and a wrong password in ~347ms, with no
 * overlap at all. That 25x gap is a reliable oracle for "does this account
 * exist", which is exactly what login/route.ts's single generic error message
 * exists to prevent.
 */
export async function burnPasswordComparison(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}
