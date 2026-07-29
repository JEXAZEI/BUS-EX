-- ============================================================================
-- BUS-EX: JEX-style classroom stock exchange
-- Schema for plain Postgres (Neon free tier, or any Postgres 14+).
--
-- Run this once against a fresh database (Neon SQL editor, or
-- `psql "$DATABASE_URL" -f db/schema.sql`) before starting the app.
-- All authorization/business logic (who can trade, who can admin, the AMM
-- math) lives in the Next.js app (src/lib/services/*), not in the database
-- -- this file only defines structure, constraints, and indexes.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type user_role as enum ('student', 'teacher', 'owner');
create type trade_side as enum ('buy', 'sell');
create type event_type as enum (
  'price_shock',
  'sector_move',
  'scandal_delist',
  'relist',
  'cash_bonus',
  'cash_tax'
);

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Singleton table of game-wide settings, editable by teacher/owner.
create table game_settings (
  id smallint primary key default 1 check (id = 1),
  default_starting_cash numeric(14, 2) not null default 1000,
  updated_at timestamptz not null default now()
);

insert into game_settings (id, default_starting_cash) values (1, 1000);

-- Emails that should be granted teacher/owner role on signup, instead of the
-- default student role. Managed by the owner directly in this table (via
-- the Neon SQL editor, or a future admin UI). Matched against the optional
-- "admin email" field on the signup form -- login itself is always by
-- username, this is only used once, at signup, to decide the account's role.
create table admin_allowlist (
  email text primary key,
  role user_role not null check (role in ('teacher', 'owner')),
  created_at timestamptz not null default now()
);

-- Every account: student, teacher, or owner. This is the app's own auth
-- table (no external auth provider) -- password_hash is a bcrypt hash,
-- never a plaintext password.
create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role user_role not null default 'student',
  admin_email text,
  cash_balance numeric(14, 2) not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index users_role_idx on users (role);
create unique index users_username_lower_idx on users (lower(username));

-- Opaque server-side sessions. The httpOnly cookie holds the raw random
-- token; only its SHA-256 hash is ever stored here, so a database leak
-- alone can't be used to forge a session.
create table sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- A parody company. pool_cash / pool_shares form a constant-product (x*y=k)
-- AMM liquidity pool. Spot price is always pool_cash / pool_shares.
-- starting_pool_cash / starting_pool_shares are preserved so "reset for a
-- new term" can restore the market to its configured initial state without
-- losing the teacher's configuration.
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text not null unique,
  description text not null default '',
  sector text not null default 'general',
  pool_cash numeric(18, 4) not null check (pool_cash > 0),
  pool_shares numeric(18, 4) not null check (pool_shares > 0),
  total_shares numeric(18, 4) not null check (total_shares > 0),
  starting_pool_cash numeric(18, 4) not null,
  starting_pool_shares numeric(18, 4) not null,
  is_delisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pool_shares_le_total check (pool_shares <= total_shares)
);

create index companies_sector_idx on companies (sector);

-- A user's current position in a company. Written only by the trade/reset
-- service functions (src/lib/services/trades.ts), never directly from an
-- API route body.
create table holdings (
  user_id uuid not null references users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  shares numeric(18, 4) not null default 0 check (shares >= 0),
  primary key (user_id, company_id)
);

-- Append-only trade log.
create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  side trade_side not null,
  shares numeric(18, 4) not null check (shares > 0),
  cash_amount numeric(14, 2) not null check (cash_amount > 0),
  price_per_share numeric(18, 6) not null check (price_per_share > 0),
  created_at timestamptz not null default now()
);

create index trades_user_idx on trades (user_id, created_at desc);
create index trades_company_idx on trades (company_id, created_at desc);

-- Spot-price snapshots, written on every trade and every market event, used
-- to draw the price chart on the company page.
create table price_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies (id) on delete cascade,
  price numeric(18, 6) not null check (price > 0),
  recorded_at timestamptz not null default now()
);

create index price_history_company_idx on price_history (company_id, recorded_at desc);

-- Periodic snapshots of each user's net worth (cash + holdings at spot
-- price), used to draw the "net worth over time" chart on the profile page.
create table net_worth_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  net_worth numeric(14, 2) not null,
  recorded_at timestamptz not null default now()
);

create index net_worth_snapshots_user_idx on net_worth_snapshots (user_id, recorded_at desc);

-- Reusable pool of random-event templates. Teacher/owner can add more
-- directly in this table (Neon SQL editor / table view) without touching
-- code. Placeholders {company} / {sector} / {pct} / {amount} are
-- substituted by src/lib/services/events.ts when an event fires.
create table event_templates (
  id uuid primary key default gen_random_uuid(),
  event_type event_type not null,
  title_template text not null,
  description_template text not null,
  min_impact_pct numeric(6, 4),
  max_impact_pct numeric(6, 4),
  min_cash numeric(10, 2),
  max_cash numeric(10, 2),
  weight int not null default 1 check (weight > 0),
  is_active boolean not null default true
);

-- Log of every event that has actually fired (manual or random), shown on
-- the news ticker / event feed.
create table events (
  id uuid primary key default gen_random_uuid(),
  event_type event_type not null,
  title text not null,
  description text not null,
  affected_company_ids uuid[] not null default '{}',
  price_impact_pct numeric(6, 4),
  cash_impact numeric(10, 2),
  triggered_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index events_created_idx on events (created_at desc);

-- Login-attempt log for rate limiting (src/lib/rateLimit.ts).
create table login_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_identifier_idx on login_attempts (identifier, attempted_at desc);
