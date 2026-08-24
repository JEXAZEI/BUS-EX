import "server-only";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isUsernameAvailable, isEmailAvailable, getDefaultStartingCash } from "@/lib/services/admin";

export class SignupError extends Error {}

export interface SignupInput {
  username: string;
  fullName: string;
  email: string;
  password: string;
}

// Public signup always creates a plain student account. Teacher/owner
// accounts are pre-created directly in the database (see README) rather
// than self-assigned through this form.
export async function signupUser(input: SignupInput): Promise<typeof users.$inferSelect> {
  // Checked separately so the message names the field that's actually taken.
  // Both are still racy against a simultaneous signup, which is why the route
  // also handles the unique-violation the database raises -- this check just
  // turns the common case into a clear message instead of a generic conflict.
  if (!(await isUsernameAvailable(input.username))) {
    throw new SignupError("That username is already taken");
  }
  if (!(await isEmailAvailable(input.email))) {
    throw new SignupError("An account with that email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const startingCash = await getDefaultStartingCash();

  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      role: "student",
      cashBalance: String(startingCash),
    })
    .returning();

  if (!created) throw new SignupError("Could not create your account. Try again.");
  return created;
}
