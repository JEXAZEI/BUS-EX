import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

export async function findUserByUsername(username: string) {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await db.update(users).set({ isActive: active }).where(eq(users.id, userId));
}

export async function deleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}
