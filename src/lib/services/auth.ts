import "server-only";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isUsernameAvailable, getDefaultStartingCash } from "@/lib/services/admin";

export class SignupError extends Error {}

// Public signup always creates a plain student account. Teacher/owner
// accounts are pre-created directly in the database (see README) rather
// than self-assigned through this form.
export async function signupUser(
  username: string,
  password: string
): Promise<typeof users.$inferSelect> {
  if (!(await isUsernameAvailable(username))) {
    throw new SignupError("That username is already taken");
  }

  const passwordHash = await hashPassword(password);
  const startingCash = await getDefaultStartingCash();

  const [created] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      role: "student",
      cashBalance: String(startingCash),
    })
    .returning();

  if (!created) throw new SignupError("Could not create your account. Try again.");
  return created;
}
