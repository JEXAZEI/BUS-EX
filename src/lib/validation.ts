import { z } from "zod";

// Usernames: alphanumeric + underscore/hyphen only. This blocks any HTML/JS
// payload from ever being stored as a username (defense against stored XSS),
// independent of output-encoding, which React/Next also does automatically
// by default when rendering text.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, - and _");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const signupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  adminEmail: z.union([emailSchema, z.literal("")]).optional(),
});

export const loginSchema = z.object({
  username: usernameSchema,
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
});
