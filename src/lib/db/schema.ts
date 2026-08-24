import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  integer,
  bigint,
  primaryKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["student", "teacher", "owner"]);
export const tradeSide = pgEnum("trade_side", ["buy", "sell"]);
export const marketRegimeEnum = pgEnum("market_regime", ["bull", "bear", "neutral"]);
export const eventTypeEnum = pgEnum("event_type", [
  "price_shock",
  "sector_move",
  "scandal_delist",
  "relist",
  "cash_bonus",
  "cash_tax",
]);

export const gameSettings = pgTable("game_settings", {
  id: integer("id").primaryKey().default(1),
  defaultStartingCash: numeric("default_starting_cash", { precision: 14, scale: 2 })
    .notNull()
    .default("1000"),
  marketRegime: marketRegimeEnum("market_regime").notNull().default("neutral"),
  regimeStartedAt: timestamp("regime_started_at", { withTimezone: true }).notNull().defaultNow(),
  regimeEndsAt: timestamp("regime_ends_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull().unique(),
    // Shown instead of the username wherever a person appears in the UI.
    fullName: text("full_name").notNull(),
    // Second login identifier -- username or email both work.
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("student"),
    cashBalance: numeric("cash_balance", { precision: 14, scale: 2 }).notNull().default("1000"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roleIdx: index("users_role_idx").on(t.role),
  })
);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ticker: text("ticker").notNull().unique(),
    description: text("description").notNull().default(""),
    sector: text("sector").notNull().default("general"),
    poolCash: numeric("pool_cash", { precision: 18, scale: 4 }).notNull(),
    poolShares: numeric("pool_shares", { precision: 18, scale: 4 }).notNull(),
    totalShares: numeric("total_shares", { precision: 18, scale: 4 }).notNull(),
    startingPoolCash: numeric("starting_pool_cash", { precision: 18, scale: 4 }).notNull(),
    startingPoolShares: numeric("starting_pool_shares", { precision: 18, scale: 4 }).notNull(),
    // Multiplies the ambient-drift range (drift.ts) for this company --
    // 1.0 is baseline, <1 is a steadier "blue chip", >1 is a wilder mover.
    volatility: numeric("volatility", { precision: 4, scale: 2 }).notNull().default("1.00"),
    isDelisted: boolean("is_delisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sectorIdx: index("companies_sector_idx").on(t.sector),
    poolCheck: check("pool_shares_le_total", sql`${t.poolShares} <= ${t.totalShares}`),
    volatilityCheck: check("volatility_positive", sql`${t.volatility} > 0`),
  })
);

export const holdings = pgTable(
  "holdings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    shares: numeric("shares", { precision: 18, scale: 4 }).notNull().default("0"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.companyId] }),
  })
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    side: tradeSide("side").notNull(),
    shares: numeric("shares", { precision: 18, scale: 4 }).notNull(),
    cashAmount: numeric("cash_amount", { precision: 14, scale: 2 }).notNull(),
    pricePerShare: numeric("price_per_share", { precision: 18, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("trades_user_idx").on(t.userId, t.createdAt),
    companyIdx: index("trades_company_idx").on(t.companyId, t.createdAt),
  })
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 18, scale: 6 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index("price_history_company_idx").on(t.companyId, t.recordedAt),
  })
);

export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("net_worth_snapshots_user_idx").on(t.userId, t.recordedAt),
  })
);

export const eventTemplates = pgTable("event_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: eventTypeEnum("event_type").notNull(),
  titleTemplate: text("title_template").notNull(),
  descriptionTemplate: text("description_template").notNull(),
  minImpactPct: numeric("min_impact_pct", { precision: 6, scale: 4 }),
  maxImpactPct: numeric("max_impact_pct", { precision: 6, scale: 4 }),
  minCash: numeric("min_cash", { precision: 10, scale: 2 }),
  maxCash: numeric("max_cash", { precision: 10, scale: 2 }),
  weight: integer("weight").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: eventTypeEnum("event_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    affectedCompanyIds: uuid("affected_company_ids").array().notNull().default(sql`'{}'::uuid[]`),
    priceImpactPct: numeric("price_impact_pct", { precision: 6, scale: 4 }),
    cashImpact: numeric("cash_impact", { precision: 10, scale: 2 }),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("events_created_idx").on(t.createdAt),
  })
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    identifier: text("identifier").notNull(),
    success: boolean("success").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identifierIdx: index("login_attempts_identifier_idx").on(t.identifier, t.attemptedAt),
  })
);

// Generic per-route rate-limit log (src/lib/rateLimit.ts) -- one row per
// allowed request, so a route can cap "N requests per window" for a given
// identifier (usually a user id, or client IP for unauthenticated routes)
// without needing a dedicated table per route the way login_attempts/trades
// already do for login and trading specifically.
export const apiHits = pgTable(
  "api_hits",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    identifier: text("identifier").notNull(),
    route: text("route").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identifierRouteIdx: index("api_hits_identifier_route_idx").on(t.identifier, t.route, t.createdAt),
  })
);
