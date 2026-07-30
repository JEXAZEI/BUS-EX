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
- On top of trades and admin-triggered events, quiet companies also get a small random price nudge (at most once per hour) whenever someone loads the dashboard or a company page (`applyAmbientDrift` in `src/lib/services/drift.ts`) — there's no dedicated background worker, so the market "ticks" opportunistically whenever it's actually being looked at, which keeps prices moving even between trades.
- That nudge isn't pure mean-zero noise: the whole market rotates through **bull / bear / neutral regimes** that each last roughly 10–14 hours (`src/lib/services/regime.ts`), skewing the drift range up during a bull run, down during a bear run, and symmetric when neutral. That's tuned for a **multi-day (~5 day) class term**: about 8-10 regime changes over the term, each a multi-hour stretch, instead of the mood flipping every few minutes. The hourly tick interval keeps a single rally from compounding into something absurd (a 5-minute tick over a 12-hour regime would let a bull run compound 100+ times). The current regime is deliberately **not shown anywhere in the UI** — real markets don't announce their own trend, and revealing it would hand students a free signal instead of having them read the price action themselves.
- Each company also has its own **volatility** multiplier (`companies.volatility`, editable anytime in **Admin → Companies**) that scales its drift range under whatever the market-wide regime is doing — a "blue chip" set to 0.5 barely moves, a hype stock set to 2.5 swings hard, both under the same bull/bear cycle. The 20 seeded companies already have distinct values matching their personalities (see `db/seed.sql`).

**Leaderboard.** `/leaderboard` ranks every active student by net worth
(cash + holdings at spot price), computed fresh on every page load
(`getLeaderboard` in `src/lib/services/leaderboard.ts`). It only shows
usernames and total net worth, never which companies someone holds or
their trade history -- that stays private on their own profile page.
Teacher/owner accounts are excluded since they can't trade.

**Price charts** (company page and profile net-worth) have Google Finance
-style range buttons -- **1H / 1D / 5D** -- scaled to this game's actual
timescale (5D is effectively "the whole term") instead of years, with a
real time-labeled x-axis instead of a bare unlabeled line
(`src/components/PriceChart.tsx`).

**A few light educational touches**, since this is for a business class:
- Every company page has a **Fundamentals** card (market cap, shares
  outstanding, shares in circulation, beta) that teaches the vocabulary a
  real brokerage app uses, computed from data that's already on the page.
- The profile page has a **Diversification meter** -- a stacked bar of
  where a student's money is (per-company + cash) plus a plain-language
  assessment ("Highly concentrated" / "Well diversified") based on their
  largest position, with a one-line explanation of why diversification
  matters.
- Clicking **Reset game for new term** first shows a **term recap** (top 3
  net worth, most active trader, biggest single trade, best-performing
  stock) computed from the trading history that's about to be wiped
  (`getTermRecap` in `src/lib/services/recap.ts`) -- a fun highlight reel
  before it's gone.

---

## 1. Setup

### 1.1 Create the Neon database

1. Go to [neon.tech](https://neon.tech) and create a free account/project (the free tier allows generous usage with no cap on the number of projects, unlike some other providers).
2. In the Neon dashboard, open the **SQL Editor** and run, in order:
   - `db/schema.sql` (tables, indexes, constraints)
   - `db/seed.sql` (starter companies, event templates)
3. Pre-create your Teacher and Owner accounts (see "Pre-creating admin
   accounts" below) — the public signup form only ever creates plain student
   accounts, so admin accounts need to be inserted directly.
4. Copy the **pooled connection string** from Neon's Connection Details panel
   (it looks like `postgres://user:password@ep-xxxx.neon.tech/dbname?sslmode=require`) — this is your `DATABASE_URL`.

### 1.1b Pre-creating admin accounts

Teacher/owner accounts aren't self-service — there's no field on the signup
form for them. Instead, create them directly with a bcrypt-hashed password:

1. Generate a hash for the password you want, using the same hashing the app
   uses (12 salt rounds):
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD_HERE', 12))"
   ```
   (Run this from the project directory after `npm install`, so `bcryptjs` is
   available.)
2. In Neon's SQL Editor, run:
   ```sql
   insert into users (username, password_hash, role, cash_balance)
   values ('YOUR_USERNAME_HERE', 'PASTE_THE_HASH_HERE', 'owner', 1000);
   ```
   Use `'teacher'` instead of `'owner'` for the teacher account. Username can
   be anything unique (an email address works fine, or a plain name) — it's
   just what you type into the login form, there's no real inbox involved.
3. Log in at `/login` with that username and password.

To add more admins later (e.g. a co-teacher), repeat step 2 with a new
username/role. To change an existing admin's password later, generate a new
hash and `update users set password_hash = '...' where username = '...';`.

**Don't commit real password hashes to a public repo.** Even though bcrypt
hashes aren't trivially reversible, a hash of a weak/guessable password (like
a short dictionary word) can still be cracked offline given enough attempts.
Run the hash-generation command locally and paste the result only into
Neon's SQL editor, never into a file you `git commit`.

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

Visit `http://localhost:3000`. Log in with the owner/teacher username and
password you created in "Pre-creating admin accounts" above. Everyone else
(your classmates) creates their own account through `/signup`, which always
makes a regular student account.

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

The public `/signup` form always creates a student account. Teacher/owner
accounts are pre-created directly with a SQL insert (see "Pre-creating admin
accounts" in section 1) — add more teachers the same way, any time, with no
redeploy needed.

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
ticker, sector, description, starting AMM pool size, and volatility --
pool size is locked after creation since changing it retroactively would
distort existing trades, but volatility can be tuned anytime) and
delist/relist existing ones. Twenty placeholder companies across 7 sectors
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
  seed.sql                             -- starter companies, event templates
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
