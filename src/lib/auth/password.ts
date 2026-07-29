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
