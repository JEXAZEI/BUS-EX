# BUS-EX — Classroom Stock Exchange

A JEX-style simulated stock market for a business class. Students sign up, get
virtual starting cash, and trade shares in parody/joke companies against an
automated-market-maker (AMM) order book. Teachers/owners can add companies,
trigger random market events, manage the class roster, and reset the game for
a new term.

## Tech stack

- **Next.js 14** (App Router, TypeScript) — frontend + server API routes
- **Supabase** — Postgres database, authentication, and row-level security
- **Tailwind CSS** — mobile-first styling
- **Recharts** — price / net-worth charts
- Deployable for free on **Vercel** (frontend + API) + **Supabase** (free tier database/auth)

## How the market works

Each company has its own AMM liquidity pool (`pool_cash`, `pool_shares`) with
`pool_cash * pool_shares = k` held constant, exactly like a Uniswap-style
constant-product market. Buying shares pays cash from the trader's balance
into the pool and pulls shares out of the pool (raising the price); selling
does the reverse. This means:

- Prices move automatically from trading activity, with no admin needed to set them.
- A company's own treasury is never directly drained or inflated by trades — only the pool is.
- Every trade is computed **inside a single Postgres transaction** (`execute_trade`), server-side, from the live pool state — the client never sends a price, only a share quantity.

---

## 1. Setup

### 1.1 Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the Supabase dashboard, open **SQL Editor** and run, in order:
   - `supabase/migrations/0001_schema.sql` (tables, RLS policies, functions)
   - `supabase/migrations/0002_seed.sql` (starter companies, event templates, admin allowlist)
3. Before running `0002_seed.sql`, double-check the `admin_allowlist` insert at
   the top — it currently grants:
   - `ar9654@susd12.org` → **owner**
   - `anad@susd12.org` → **teacher**

   Edit those emails first if you want different accounts. You can also add
   more allowlisted emails later by inserting into `admin_allowlist` directly
   in the SQL editor — no redeploy needed.
4. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — never put it in client code or a public repo)
5. In **Authentication → Providers → Email**, turn **off** "Confirm email" (this app signs students up with synthetic emails that can't receive confirmation mail; the app itself controls who gets an account via the allowlist + username/password).

### 1.2 Configure the app

```bash
cp .env.example .env.local
```

Fill in `.env.local` with the three Supabase values above. You can leave
`STUDENT_EMAIL_DOMAIN` as-is (it's just used to build a fake internal email
like `alice@students.bus-ex.local` for student accounts, since Supabase Auth
requires an email address but students only need a username + password).

### 1.3 Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Sign up once as `ar9654@susd12.org` (or
whichever email you put in the owner allowlist) to get the Owner role, and
once as the teacher email for the Teacher role. Everyone else who signs up
without an admin email becomes a regular student.

### 1.4 Deploy for free

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Import the repo into [Vercel](https://vercel.com) (free Hobby tier).
3. Add the same three env vars (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) plus
   `STUDENT_EMAIL_DOMAIN` in the Vercel project's Environment Variables.
4. Deploy. That's it — no server to manage.

**Optional: scheduled random events.** `vercel.json` defines a cron job that
hits `/api/cron/random-event` once an hour to fire a random market event
automatically, in addition to the teacher's manual "fire event" button in
`/admin`. To enable it, set a `CRON_SECRET` env var in Vercel (any long
random string) — the route checks it and does nothing without it. Note:
Vercel's free Hobby plan limits how often cron jobs can run (currently once a
day); the manual trigger in the admin panel always works regardless, so
scheduled events are a nice-to-have, not a requirement.

---

## 2. Security measures implemented

- **Password hashing** — Supabase Auth (GoTrue) hashes all passwords with
  bcrypt + a per-user salt before storage. Plaintext passwords are never
  written to any table by this app's code.
- **No raw SQL / SQL injection** — all database access goes through the
  Supabase JS client (parameterized queries) or `SECURITY DEFINER` Postgres
  functions called via RPC with typed arguments. There is no string-concatenated
  SQL anywhere in the app.
- **Server-side authorization on every balance-changing action** — trades,
  admin actions, and event effects are never computed on the client. The
  client only ever sends *intent* (e.g. "buy 5 shares of company X"); the
  actual price, cash movement, and share movement are recomputed from the
  live database state inside `execute_trade` (see
  `supabase/migrations/0001_schema.sql`), which locks the relevant rows
  (`FOR UPDATE`) so trades can't race each other. A malicious client cannot
  submit a fake price or balance.
- **Row-level security (RLS)** — enabled on every table. Students can only
  read their own profile, holdings, trades, and net-worth history (teachers
  and owners can additionally read everything, for oversight/grading).
  Nobody can write to `profiles.cash_balance`, `holdings`, or `trades`
  directly — only the `SECURITY DEFINER` functions can, and those enforce
  the game's rules (e.g. "you can't sell shares you don't own").
- **HTTPS-only, httpOnly session cookies** — auth sessions are stored in
  httpOnly + secure + sameSite=lax cookies via `@supabase/ssr`, set on the
  server (`src/lib/supabase/server.ts`, `src/middleware.ts`). The session
  token is never written to `localStorage` or exposed to client-side
  JavaScript.
- **Login rate limiting** — `src/lib/rateLimit.ts` tracks failed login
  attempts per (username, IP) pair in a `login_attempts` table (not
  readable by any client role) and locks out further attempts for 15
  minutes after 5 failures, mitigating brute-force password guessing.
- **Input validation & sanitization** — every API route validates its input
  with `zod` schemas (`src/lib/validation.ts`) before touching the database:
  usernames/tickers/sectors are restricted to safe character sets, numeric
  fields are bounded, and text fields are length-limited. React escapes all
  rendered text by default, so user-supplied strings (usernames, company
  descriptions, event text) can't inject HTML/JS into other users' pages
  (stored XSS).
- **Distinct admin roles in the schema** — `profiles.role` is a Postgres
  `enum ('student', 'teacher', 'owner')`, not a boolean "is_admin" flag, so
  teacher and owner permissions can diverge without a schema rewrite. Owner-only
  actions (password reset, account deletion) are checked explicitly in
  their API routes in addition to being separate from teacher's DB-level
  `is_admin()` permissions.
- **Least-privilege service role usage** — the Supabase service-role key
  (which bypasses RLS) is only ever used server-side (`server-only` package
  enforces this at build time) for the narrow set of operations that
  genuinely need it: signup, login email lookup, rate-limit bookkeeping, and
  owner-only account management. It is never sent to the browser.
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
whoever signs up with an allowlisted email gets that role; everyone else is a
student. Add more teachers by inserting more rows into `admin_allowlist`.

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
accounts from **Admin → Users** (Owner only) or re-run the SQL migrations
against a fresh Supabase project.

## 5. Adding/editing parody companies

**Admin → Companies** lets teachers/owners create new companies (name,
ticker, sector, description, and starting AMM pool size — pool size is
locked after creation since changing it retroactively would distort
existing trades) and delist/relist existing ones. Ten placeholder companies
are seeded by `0002_seed.sql`; replace or extend them at any time, no code
changes required.

## 6. Adding more random event types

Event templates live in the `event_templates` table and are picked at
random (weighted) whenever an event fires — either manually from **Admin →
Market events** or via the optional hourly cron job. Add a new row to
`event_templates` (via the Supabase SQL editor or table editor) to expand
the pool; `{company}`, `{sector}`, `{pct}`, and `{amount}` in the title/description
templates get substituted automatically. See `supabase/migrations/0002_seed.sql`
for examples of each `event_type`.

## 7. Project structure

```
src/
  app/
    (auth)/login, (auth)/signup        -- public auth pages
    (app)/dashboard, company/[id],     -- authenticated pages (shared navbar)
      profile, admin/*
    api/                               -- all server-side mutations
  components/                          -- UI + admin widgets
  lib/
    supabase/{client,server,admin}.ts  -- browser / SSR / service-role clients
    session.ts                         -- requireProfile/requireAdmin/requireOwner
    validation.ts                      -- zod schemas
    rateLimit.ts                       -- login attempt limiter
    amm.ts                             -- client-side trade preview math
supabase/migrations/
  0001_schema.sql                      -- tables, RLS, SECURITY DEFINER functions
  0002_seed.sql                        -- allowlist, starter companies, event templates
```
