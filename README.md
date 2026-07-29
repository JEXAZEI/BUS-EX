# BUS-EX — Classroom Stock Exchange

A JEX-style simulated stock market for a business class. Students sign up, get
virtual starting cash, and trade shares in parody/joke companies against an
automated-market-maker (AMM) order book. Teachers/owners can add companies,
trigger random market events, manage the class roster, and reset the game for
a new term.

## Tech stack

- **Next.js 14** (App Router, TypeScript) — frontend + server API routes
- **Neon** — free serverless Postgres (no project-count cap, unlike some
  managed-backend free tiers)
- **Drizzle ORM** + `pg` — typed, parameterized database access
- A small hand-rolled auth layer — bcrypt password hashing + opaque
  server-side sessions in httpOnly cookies (no third-party auth provider)
- **Tailwind CSS** — mobile-first styling
- **Recharts** — price / net-worth charts
- Deployable for free on **Vercel** (frontend + API) + **Neon** (database)

## How the market works

Each company has its own AMM liquidity pool (`pool_cash`, `pool_shares`) with
`pool_cash * pool_shares = k` held constant, exactly like a Uniswap-style
constant-product market. Buying shares pays cash from the trader's balance
into the pool and pulls shares out of the pool (raising the price); selling
does the reverse. This means:

- Prices move automatically from trading activity, with no admin needed to set them.
- A company's own treasury is never directly drained or inflated by trades — only the pool is.
- Every trade is computed **inside a single Postgres transaction with row locks** (`executeTrade` in `src/lib/services/trades.ts`), server-side, from the live pool state — the client never sends a price, only a share quantity.

---

## 1. Setup

### 1.1 Create the Neon database

1. Go to [neon.tech](https://neon.tech) and create a free account/project (the free tier allows generous usage with no cap on the number of projects, unlike some other providers).
2. In the Neon dashboard, open the **SQL Editor** and run, in order:
   - `db/schema.sql` (tables, indexes, constraints)
   - `db/seed.sql` (starter companies, event templates, admin allowlist)
3. Before running `db/seed.sql`, double-check the `admin_allowlist` insert at
   the top — it currently grants:
   - `ar9654@susd12.org` → **owner**
   - `anad@susd12.org` → **teacher**

   Edit those emails first if you want different accounts. You can also add
   more allowlisted emails later by inserting into `admin_allowlist` directly
   in the SQL editor — no redeploy needed. This email is only ever checked
   once, at signup, against an optional field on the signup form — login
   itself is always by username, there's no real email/inbox involved.
4. Copy the **pooled connection string** from Neon's Connection Details panel
   (it looks like `postgres://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`) — this is your `DATABASE_URL`.

### 1.2 Configure the app

```bash
cp .env.example .env.local
```

Fill in `.env.local` with the `DATABASE_URL` from Neon. `CRON_SECRET` is
optional (see 1.4).

### 1.3 Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Sign up once, entering `ar9654@susd12.org` (or
whichever email you put in the owner allowlist) in the "teacher/admin email"
field, to get the Owner role, and once with the teacher email for the Teacher
role. Everyone else who signs up with that field blank becomes a regular
student.

### 1.4 Deploy for free

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo into [Vercel](https://vercel.com) (free Hobby tier).
3. Add `DATABASE_URL` (and optionally `CRON_SECRET`) in the Vercel project's
   Environment Variables.
4. Deploy. That's it — no server to manage.

**Optional: scheduled random events.** `vercel.json` defines a cron job that
hits `/api/cron/random-event` once a day (at 16:00 UTC, adjust to taste) to
fire a random market event automatically, in addition to the teacher's manual
"fire event" button in `/admin`. To enable it, set `CRON_SECRET` in Vercel
(any long random string) — the route checks it and does nothing without it.
Vercel's free Hobby plan only allows daily cron jobs (not hourly), which is
why it's scheduled once a day; the manual trigger in the admin panel always
works regardless, so scheduled events are a nice-to-have, not a requirement.

---

## 2. Security measures implemented

- **Password hashing** — passwords are hashed with **bcrypt** (via
  `bcryptjs`, 12 salt rounds) in `src/lib/auth/password.ts` before ever
  touching the database. Plaintext passwords are never stored, logged, or
  compared directly.
- **No raw SQL / SQL injection** — all database access goes through Drizzle
  ORM's query builder or explicitly parameterized `client.query(text,
  params)` calls (used for the multi-statement trade/event transactions).
  There is no string-concatenated SQL anywhere in the app; user input is
  never interpolated into a query string.
- **Server-side authorization on every balance-changing action** — trades,
  admin actions, and event effects are never computed on the client. The
  client only ever sends *intent* (e.g. "buy 5 shares of company X"); the
  actual price, cash movement, and share movement are recomputed from the
  live database state inside `executeTrade`
  (`src/lib/services/trades.ts`), which runs in a single Postgres
  transaction with `SELECT ... FOR UPDATE` row locks so trades can't race
  each other. A malicious client cannot submit a fake price or balance.
- **Explicit per-request authorization** — every API route re-derives the
  caller's identity and role from their session cookie
  (`getCurrentProfile()` / `getSessionUser()`) and checks it before doing
  anything sensitive; there's no client-trusted "am I an admin" flag. Owner-
  only actions (password reset, account deletion) are checked in their own
  route in addition to being a distinct role from teacher (see below), so
  permissions can't be spoofed by editing a request body.
- **Data access is scoped per-user in application code** — every query that
  returns account-specific data (holdings, trades, cash balance, net-worth
  history) is filtered by the authenticated caller's own `user_id` at the
  query layer (see `src/app/(app)/profile/page.tsx`,
  `src/lib/services/*`); teachers/owners can additionally see everything,
  for grading/oversight. There is no endpoint that returns another
  student's private data.
- **HTTPS-only, httpOnly session cookies** — sessions are opaque random
  tokens (32 bytes from `crypto.randomBytes`); only their SHA-256 hash is
  stored server-side (`sessions` table), and the cookie is set with
  `httpOnly`, `secure` (in production), and `sameSite=lax`
  (`src/lib/auth/session.ts`). The session token is never written to
  `localStorage` or exposed to client-side JavaScript, and a database leak
  alone can't be used to forge a session.
- **Login rate limiting** — `src/lib/rateLimit.ts` tracks failed login
  attempts per (username, IP) pair in a `login_attempts` table and locks
  out further attempts for 15 minutes after 5 failures, mitigating
  brute-force password guessing.
- **Input validation & sanitization** — every API route validates its input
  with `zod` schemas (`src/lib/validation.ts`) before touching the database:
  usernames/tickers/sectors are restricted to safe character sets, numeric
  fields are bounded, and text fields are length-limited. React escapes all
  rendered text by default, so user-supplied strings (usernames, company
  descriptions, event text) can't inject HTML/JS into other users' pages
  (stored XSS).
- **Distinct admin roles in the schema** — `users.role` is a Postgres
  `enum ('student', 'teacher', 'owner')`, not a boolean "is_admin" flag, so
  teacher and owner permissions can diverge without a schema rewrite.
  Owner-only routes check `profile.role === "owner"` explicitly, on top of
  the teacher/owner check shared by other admin routes.
- **Security headers** — `next.config.js` sets `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive
  `Permissions-Policy` on every response.

**Known residual risk:** `npm audit` currently flags two advisories in
Next.js 14.2.x (an SSRF issue in the `rewrites()` config feature and an
internal Server Actions endpoint disclosure issue) that are only fixed in
Next.js 16, which is a breaking major-version upgrade. This app doesn't use
`rewrites()` or Server Actions (all mutations go through explicit Route
Handlers under `/api`), so exposure is low, but you should periodically run
`npm audit` and consider upgrading Next.js as the ecosystem matures.

---

## 3. Roles

| Role | Companies | Events | Game settings | Reset game | User accounts |
|---|---|---|---|---|---|
| Student | trade only | view only | — | — | own account only |
| Teacher | add/edit/delist | trigger | adjust starting cash | yes | — |
| Owner | add/edit/delist | trigger | adjust starting cash | yes | reset passwords, deactivate/delete accounts |

Roles are assigned automatically at signup via the `admin_allowlist` table —
whoever signs up with an allowlisted email (entered in the optional
"teacher/admin email" field) gets that role; everyone else is a student. Add
more teachers by inserting more rows into `admin_allowlist` in the Neon SQL
editor.

## 4. Resetting the game for a new class term

1. Log in as the Owner or Teacher and go to **Admin → New semester**.
2. Click **Reset game for new term**, then confirm.

This wipes all trades, price history, holdings, net-worth history, and the
event log, resets every student's cash balance to the configured starting
amount (**Admin → Game settings**), and resets every company's price back to
its original starting price. Company definitions (names, tickers,
descriptions) and user accounts are preserved — this is meant for "same
class, new semester," not "start over from an empty database." If you want a
completely clean slate (e.g. a new class roster), also remove old student
accounts from **Admin → Users** (Owner only) or re-run `db/schema.sql` +
`db/seed.sql` against a fresh Neon database.

## 5. Adding/editing parody companies

**Admin → Companies** lets teachers/owners create new companies (name,
ticker, sector, description, and starting AMM pool size — pool size is
locked after creation since changing it retroactively would distort
existing trades) and delist/relist existing ones. Ten placeholder companies
are seeded by `db/seed.sql`; replace or extend them at any time, no code
changes required.

## 6. Adding more random event types

Event templates live in the `event_templates` table and are picked at
random (weighted) whenever an event fires — either manually from **Admin →
Market events** or via the optional hourly cron job. Add a new row to
`event_templates` (via the Neon SQL editor or table view) to expand the
pool; `{company}`, `{sector}`, `{pct}`, and `{amount}` in the
title/description templates get substituted automatically. See
`db/seed.sql` for examples of each `event_type`, and
`src/lib/services/events.ts` for how substitution works.

## 7. Project structure

```
db/
  schema.sql                           -- tables, indexes, constraints (run first)
  seed.sql                             -- allowlist, starter companies, event templates
src/
  app/
    (auth)/login, (auth)/signup        -- public auth pages
    (app)/dashboard, company/[id],     -- authenticated pages (shared navbar)
      profile, admin/*
    api/                               -- all server-side mutations
  components/                          -- UI + admin widgets
  lib/
    db/
      schema.ts                        -- Drizzle table definitions (mirrors db/schema.sql)
      client.ts                        -- pg Pool + Drizzle instance, withTransaction() helper
      mappers.ts                       -- DB row -> app-level type conversion
    auth/
      password.ts                      -- bcrypt hashing
      session.ts                       -- opaque session tokens + httpOnly cookies
    services/                          -- all business logic (trades, events, admin actions)
    session.ts                         -- requireProfile/requireAdmin/requireOwner
    validation.ts                      -- zod schemas
    rateLimit.ts                       -- login attempt limiter
    amm.ts                             -- client-side trade preview math
    types.ts                           -- shared app-level types
```
