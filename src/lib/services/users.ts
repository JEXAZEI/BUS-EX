import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export class ChangePasswordError extends Error {}

export async function findUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Owner-initiated reset (e.g. a student forgot their password, or the
 * account looks compromised). Revokes every existing session for the
 * account -- a session is only ever checked against the password at login
 * time, not per-request, so without this an attacker holding a stolen
 * session would stay logged in for up to 30 days even after the password
 * changes underneath them.
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Self-service password change -- requires proving you know the current
 * password. Revokes every existing session for the account, same reasoning
 * as resetUserPassword; the caller (the change-password route) is
 * responsible for issuing the user a fresh session afterward so they're not
 * logged out of the device they just used to change it.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ChangePasswordError("Account not found");

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) throw new ChangePasswordError("Current password is incorrect");

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Deactivating is already enforced server-side on every request (every API
 * route checks profile.is_active), but revoking sessions here too means
 * access is cut the instant a teacher/owner clicks Deactivate, rather than
 * depending on every current and future route remembering that check.
 */
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await db.update(users).set({ isActive: active }).where(eq(users.id, userId));
  if (!active) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
}

export async function deleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}
