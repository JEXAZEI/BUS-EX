import { z } from "zod";

// Usernames: letters, numbers, and common email-safe punctuation (admin
// accounts use their email address as their username). This still blocks
// any HTML/JS payload from ever being stored as a username (defense against
// stored XSS), independent of output-encoding, which React/Next also does
// automatically by default when rendering text.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(50, "Username must be at most 50 characters")
  .regex(/^[a-zA-Z0-9._%+@-]+$/, "Username can only contain letters, numbers, and . _ % + @ -");

// Deliberately a denylist of the genuinely-obvious rather than a complexity
// rule (no "must contain a symbol"). Complexity rules mostly produce
// forgotten passwords and password-reset requests, which in a 1-hour class
// period costs a student real trading time; blocking the handful of
// passwords an attacker would actually guess first gets most of the benefit
// at almost none of the cost. Entries are stored lowercase and compared
// case-insensitively, so "Password1" is caught by "password1".
//
// Only the 8+ character entries can ever actually be reached (shorter ones
// fail the length rule first), but the short ones are kept so the list stays
// correct if that minimum ever changes. The school-flavored entries near the
// end are here because they're exactly what students pick in practice.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssword",
  "p@ssw0rd", "12345678", "123456789", "1234567890", "87654321", "11111111",
  "00000000", "12341234", "qwerty123", "qwertyui", "qwertyuiop", "1qaz2wsx",
  "zaq12wsx", "1q2w3e4r", "qazwsxedc", "asdfghjk", "asdfghjkl", "asdfasdf",
  "iloveyou", "princess", "sunshine", "football", "baseball", "basketball",
  "superman", "batman123", "welcome1", "welcome123", "letmein1", "letmein12",
  "letmein123", "admin123", "administrator", "abc12345", "abcd1234",
  "monkey123", "trustno1", "dragon123", "starwars", "whatever", "computer",
  "internet", "freedom1", "shadow123", "master123", "changeme", "changeme1",
  "default1", "guest123", "test1234", "testtest", "temp1234",
  // Classroom-specific guesses.
  "school123", "student1", "student12", "student123", "teacher1", "teacher12",
  "teacher123", "homework1", "homework123", "busex123", "stockmarket",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

/**
 * Blocks a password that is just the account's own username -- the single
 * most likely "so I don't forget it" choice. Also checks the local part of
 * an email-style username (the bit before the @), since admin accounts here
 * use full email addresses and "ar9654" is the memorable half of
 * "ar9654@susd12.org".
 *
 * Deliberately an exact-match test, not a substring one: rejecting anything
 * merely *containing* the username would block reasonable passwords like
 * "johnsbigadventure" for user "john", and a confusing rejection mid-class
 * is worse than a slightly weak password in a fake-money game.
 */
export function passwordMatchesUsername(password: string, username: string): boolean {
  const pw = password.trim().toLowerCase();
  const user = username.trim().toLowerCase();
  if (!pw || !user) return false;
  if (pw === user) return true;

  const localPart = user.split("@")[0]!;
  return localPart.length >= 4 && pw === localPart;
}

// Real names, so deliberately permissive about punctuation -- apostrophes
// ("O'Brien"), hyphens ("Mary-Jane"), periods ("Jr."), and accented letters
// are all legitimate. The \p{L} unicode class covers non-English alphabets
// rather than silently rejecting them. Angle brackets and the like are still
// excluded, keeping the same anti-stored-XSS guarantee usernames have.
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name")
  .max(80, "Name must be at most 80 characters")
  .regex(/^[\p{L}\p{M}'.\- ]+$/u, "Name can only contain letters, spaces, apostrophes, and hyphens");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .max(120, "Email must be at most 120 characters");

// Login accepts either identifier, so this can't reuse usernameSchema (which
// bans characters an email may legitimately contain) or emailSchema (which
// would reject plain usernames). Kept loose on purpose: the lookup is a
// parameterized exact match, and a too-strict rule here would just turn a
// wrong-password message into a confusing validation error.
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(3, "Enter your username or email")
  .max(120, "That's too long to be a username or email");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .refine((pw) => !isCommonPassword(pw), {
    message: "That password is too easy to guess. Please pick a different one.",
  });

export const signupSchema = z
  .object({
    username: usernameSchema,
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .superRefine((data, ctx) => {
    // Checked against the email too, not just the username -- now that an
    // account has two login identifiers, "password == my email" is exactly
    // as guessable as "password == my username" was.
    if (
      passwordMatchesUsername(data.password, data.username) ||
      passwordMatchesUsername(data.password, data.email)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Your password can't be the same as your username or email.",
      });
    }
  });

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: z.string().min(1, "Password is required").max(200),
});

export const tradeSchema = z.object({
  companyId: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  shares: z.number().positive().finite().max(10_000_000),
});

export const companyUpsertSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(60),
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Ticker must be letters/numbers only"),
  description: z.string().trim().max(500).optional().default(""),
  sector: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[a-zA-Z0-9 _-]+$/, "Sector can only contain letters, numbers, spaces, - and _"),
  startingPoolCash: z.number().positive().max(100_000_000),
  startingPoolShares: z.number().positive().max(100_000_000),
  volatility: z.number().positive().max(10).default(1),
});
