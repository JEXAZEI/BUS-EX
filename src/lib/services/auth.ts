import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, adminAllowlist } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isUsernameAvailable, getDefaultStartingCash } from "@/lib/services/admin";

export class SignupError extends Error {}

export async function signupUser(
  username: string,
  password: string,
  adminEmail: string | null
): Promise<typeof users.$inferSelect> {
  if (!(await isUsernameAvailable(username))) {
    throw new SignupError("That username is already taken");
  }

  let role: "student" | "teacher" | "owner" = "student";
  if (adminEmail) {
    const [allowlisted] = await db
      .select()
      .from(adminAllowlist)
      .where(eq(adminAllowlist.email, adminEmail))
      .limit(1);
    if (allowlisted) role = allowlisted.role;
  }

  const passwordHash = await hashPassword(password);
  const startingCash = await getDefaultStartingCash();

  const [created] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      role,
      adminEmail,
      cashBalance: String(startingCash),
    })
    .returning();

  if (!created) throw new SignupError("Could not create your account. Try again.");
  return created;
}
