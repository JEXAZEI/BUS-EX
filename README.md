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
- Share quantities are **quantized to 4 decimal places before any pool math**, matching the `numeric(18,4)` columns they're stored in. Doing the math on the unrounded value instead meant a buy of `0.12345` shares took `0.12345` out of the pool while the holding stored `0.1235`; the discrepancy accumulated until `pool_shares + holdings` passed `total_shares`, and selling the position back tripped the `pool_shares_le_total` constraint with a 500. **The invariant to preserve: pool and holdings must be in the same precision as the columns.**
- On top of trades and admin-triggered events, quiet companies also get a small random price nudge **every 3 minutes** whenever someone loads the dashboard or a company page (`applyAmbientDrift` in `src/lib/services/drift.ts`) — there's no dedicated background worker, so the market only actually advances when someone's logged in and looking at it. To compensate, a company that's fallen behind (nobody's checked on it in a while) gets **backfilled** with one tick per missed 3-minute interval, each with its own historical timestamp, instead of a single tick dated "now" -- capped at `MAX_CATCHUP_TICKS` (1440 ticks = 3 days) so a long idle stretch doesn't do unbounded work. That's what keeps the price chart's time axis meaningful (real intermediate points, not one big flat gap) and makes the market feel like it kept running over a weekend or overnight, even though the computation only happens the next time someone visits. A 3-minute interval is what gives the **1H** chart range ~20 real points to draw; at 15 minutes it had 4, and four points interpolated into a lazy curve read as nothing like a stock chart.
- The whole catch-up is written in **two queries** (one `UPDATE`, one batched multi-row `INSERT`), not two per tick. Doing it per tick meant a multi-day catch-up made thousands of sequential round trips in a single page load, which over Neon's real latency from a Vercel function blew past the serverless timeout and killed the response mid-stream — the browser reported a corrupted stream and the dashboard rendered blank. Keep it batched.
- That nudge isn't pure mean-zero noise: the whole market rotates through **bull / bear / neutral regimes** (`src/lib/services/regime.ts`), skewing drift up during a bull run, down during a bear run, and symmetric when neutral. Each regime has its own duration range — **bull 14–20h, neutral 8–12h, bear 5–9h** — and its own selection weight (bull 0.45, neutral 0.35, bear 0.2). Both asymmetries point the same way on purpose: bull runs are picked more often *and* last longer, while bear runs are sharper but shorter ("elevator down, stairs up"), so a reasonably engaged student is likely to come out ahead over a 5-day term rather than facing a coin flip. That works out to roughly ten regime stretches across the term instead of the mood flipping every few minutes.
- Because ticks are 3 minutes rather than hourly, `REGIME_BIAS` and `IDIOSYNCRATIC_DRIFT_RANGE` are **scaled down to match**: bias is divided by the tick-rate change (it accumulates additively), while the noise range is divided by its *square root* (noise accumulates as a random walk, where variance adds). The net hourly trend and volatility are unchanged — the same movement, sampled 5× more finely. If you change `DRIFT_INTERVAL_MINUTES`, rescale both or you will silently change how the whole market behaves.
- A long catch-up **rotates through regimes over the gap it is filling** (`buildRegimeTimeline`), rather than replaying the whole gap under whichever regime happens to be active now. This matters more than it sounds: applying one unbroken bias to a 60-hour weekend gap put a high-volatility stock anywhere between 6% and 437% of its pre-gap price depending on a single coin flip at page load. The timeline is built **once per drift pass and shared across every company**, because the regime is market-wide — two stocks backfilling the same minute must agree on what the market was doing.
- The current regime is deliberately **never shown to students** — real markets don't announce their own trend, and revealing it would hand them a free signal instead of having them read the price action. Teachers and owners *can* see it: **Admin** has a **Market cycle** panel showing which regime is active, when it started, how long it's been running, when it ends and how long until then, plus a form to **override** it (pick a regime and a duration in hours, up to 240).
- Each company also has its own **volatility** multiplier (`companies.volatility`, editable anytime in **Admin → Companies**) that scales its drift range under whatever the market-wide regime is doing — a "blue chip" set to 0.5 barely moves, a hype stock set to 2.5 swings hard, both under the same bull/bear cycle. The 20 seeded companies already have distinct values matching their personalities (see `db/seed.sql`).

**Leaderboard.** `/leaderboard` ranks every active student by net worth
(cash + holdings at spot price), computed fresh on every page load
(`getLeaderboard` in `src/lib/services/leaderboard.ts`). It shows each
student's **real name** and total net worth, never which companies someone
holds or their trade history -- that stays private on their own profile page.
Teacher/owner accounts are excluded since they can't trade.

Note that names are **not unique** (real people share them, and forcing
uniqueness on a class roster would be wrong), and students can edit their own
name, so in principle one student can take another's display name here. Staff
see both the name and the `@username` in **Admin → Users** and can correct it
in seconds.

**Accounts.** Every account has a username, a real name, and an email, and you
can sign in with **either the username or the email**, matched
case-insensitively (`findUserByIdentifier` in `src/lib/services/users.ts`).
The email is just a second thing you're allowed to type at login -- nothing is
ever sent to it. Students can fix their own name on their profile page;
teachers and owners can fix any student's in **Admin → Users**.

**Live-ish updates.** The dashboard, company, leaderboard, profile and admin
pages mount an `AutoRefresh` component that re-renders the route every 20
seconds, skipped entirely while the tab is in the background so a forgotten
tab doesn't hammer the database all period. There are no websockets — a
refresh is also what advances the market, since drift runs on page load.

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

> **There is no migration runner.** `db/schema.sql` is the DDL for a *fresh*
> database; nothing replays it against an existing one, and the app never
> alters its own schema at startup. If you change the schema you need to
> (a) update `db/schema.sql` for future fresh installs **and** (b) write a
> separate `ALTER TABLE …` script and run it yourself in Neon's SQL Editor.
> Test that script against a throwaway database first — a past migration that
> added `email` looked fine but assigned two accounts the same value, which
> then made the `users_email_lower_idx` unique index fail to build.

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
   insert into users (username, full_name, email, password_hash, role, cash_balance)
   values ('YOUR_USERNAME_HERE', 'Your Name', 'you@school.org',
           'PASTE_THE_HASH_HERE', 'owner', 1000);
   ```
   Use `'teacher'` instead of `'owner'` for the teacher account.
   - `username` and `email` must each be unique, and you can sign in with
     **either** one. There's no real inbox involved — nothing is ever sent to
     the address; it's just a second thing you're allowed to type at login.
   - `full_name` is what's shown on the leaderboard, profile, and admin pages
     instead of the username.
3. Log in at `/login` with either the username or the email, plus the password.

To add more admins later (e.g. a co-teacher), repeat step 2 with a new
username/email/role. To change an existing admin's password later, generate a
new hash and `update users set password_hash = '...' where username = '...';`.

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
(any long random string); the route requires a matching
`Authorization: Bearer <CRON_SECRET>` header, returns **501** if the secret
isn't configured at all, and **401** if it doesn't match. It's guarded by a
shared secret rather than a session because Vercel Cron requests carry no
browser cookies.
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
  anything sensitive; there's no client-trusted "am I an admin" flag. Every
  route also re-checks `is_active`, so deactivating an account cuts its access
  immediately rather than at next login. Owner-only actions (deactivating and
  deleting accounts) are checked in their own route in addition to being a
  distinct role from teacher (see below), so permissions can't be spoofed by
  editing a request body.
- **Authorization that depends on the target row lives in the service, not the
  route** — a teacher may reset or rename a *student*, but only the owner may
  do either to another teacher or to the owner. Writing a password hash
  directly is equivalent to taking the account over, so a teacher who could
  reset the owner would be one request away from promoting themselves. Those
  checks sit in `resetUserPassword` / `renameUserAsStaff`
  (`src/lib/services/users.ts`), where the target's role has already been
  read, so a future caller can't route around them; the hidden buttons in the
  UI are cosmetic only. Self-service rename
  (`POST /api/profile/name`) accepts **no `userId` at all** — it writes to the
  caller's own session id, so it can't be aimed at another account.
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
- **Session revocation** — changing a password (self-service or via an admin
  reset) and deactivating an account both delete every session row for that
  user. A session is only ever checked against the password at login time, so
  without this a stolen session would stay valid for up to 30 days after the
  password changed underneath it. The self-service path issues the caller a
  fresh session afterward so they aren't logged out of the device they just
  used.
- **Constant-time login** — the "no such account" path runs a throwaway bcrypt
  comparison (`burnPasswordComparison` in `src/lib/auth/password.ts`) before
  answering. Returning early instead made a miss answer in ~13 ms and a wrong
  password in ~347 ms, with no overlap — a completely reliable oracle for
  "does this account exist", which is exactly what the single shared
  `"Invalid login or password"` message exists to prevent.
- **Rate limiting on every endpoint** — `src/lib/rateLimit.ts`, all DB-backed.
  Login is capped **both** per (identifier, IP) at 5 failures per 15 minutes
  *and* per IP alone at 200 failures per 15 minutes; without the second one,
  each account carried its own fresh budget and a single machine could work
  through the whole roster five guesses at a time. Trades are capped at 10 per
  10 seconds per user, password changes at 5 per 15 minutes, self-service
  renames at 10 per hour, and each admin route at 5–40 per minute depending on
  how destructive it is.
  - The limiters **fail open** on a database error. Failing closed would lock
    an entire class out of a lesson over a transient Neon blip; the error is
    still logged.
  - Signup is limited per IP but set deliberately high (200 per 10 minutes)
    because **a whole class shares one school IP**. Any per-IP limit here has
    to clear ~30 students signing up within a few minutes of each other.
  - On paths where a *rejected* attempt shouldn't cost the user anything
    (changing a password, renaming yourself), the limit is checked **after**
    validation, not before. Checking first meant five denylist rejections
    ("student123") locked a student out without a single wrong guess. Wrong
    *current-password* guesses still count, since those are what the limit
    exists to slow down.
  - The client IP is resolved from `x-vercel-forwarded-for`, then `x-real-ip`,
    then the **last** hop of `X-Forwarded-For` (`getClientIp`). Reading the
    *first* hop — as this used to — hands the client control of its own
    rate-limit bucket, since a proxy *appends* to that header rather than
    replacing it: rotating the header got a fresh budget on every request and
    defeated the login limiter entirely. Don't "simplify" this back.
- **Password policy** — minimum 8 characters (maximum 72, bcrypt's input
  limit), enforced identically on all three paths that set a password
  (signup, self-service change, admin reset). On top of the length rule there's
  a denylist of obviously-guessable passwords (`COMMON_PASSWORDS` in
  `src/lib/validation.ts`, including classroom-flavoured guesses like
  `student123` and `teacher1`), and a rule rejecting a password that is just
  the account's own username *or* email — `passwordMatchesAccount`, which all
  three paths share precisely so they can't drift apart again (signup once
  checked both while change and reset checked only the username, so
  "password == my email" was refused at signup and accepted a minute later on
  the profile page). It's deliberately a denylist rather
  than a complexity rule — "must contain a symbol" mostly produces forgotten
  passwords, and a reset mid-period costs a student real trading time. Because
  that also rules out the passwords a teacher would naturally invent, the
  admin reset form has a **Suggest** button that generates something like
  `SwiftFalcon72` — readable aloud across a classroom and never on the
  denylist.
- **Input validation & sanitization** — every API route validates its input
  with `zod` schemas (`src/lib/validation.ts`) before touching the database:
  usernames/tickers/sectors are restricted to safe character sets, numeric
  fields are bounded, and text fields are length-limited. Names allow letters
  (including accented and non-Latin ones), spaces, apostrophes, periods and
  hyphens, but not digits, emoji or angle brackets. React escapes all
  rendered text by default, so user-supplied strings (usernames, company
  descriptions, event text) can't inject HTML/JS into other users' pages
  (stored XSS).
- **CSV formula-injection guard** — the term export
  (`src/lib/services/export.ts`) prefixes an apostrophe onto any text cell
  starting with `=`, `+`, `-`, `@`, tab or CR. Validation legitimately allows a
  leading hyphen in a name (hyphenated names) and a leading `+`, `@` or `-` in
  a username or email, all of which Excel and Sheets evaluate as formulas, so
  a student registering as `-Alice` or `@bob` turned a cell in the teacher's
  gradebook into `#NAME?`. Numeric columns are deliberately left unguarded so
  they still sort as numbers. The file's *structure* was never at risk —
  no commas, quotes or newlines can get through validation in the first place.
- **Distinct admin roles in the schema** — `users.role` is a Postgres
  `enum ('student', 'teacher', 'owner')`, not a boolean "is_admin" flag, so
  teacher and owner permissions can diverge without a schema rewrite.
  Owner-only routes check `profile.role === "owner"` explicitly, on top of
  the teacher/owner check shared by other admin routes.
- **Security headers** — `next.config.js` sets `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive
  `Permissions-Policy` on every response.

### Known residual risks

- **Dependency advisories.** `npm audit` flags a growing list against the
  pinned Next.js 14.2.x and the Tailwind/ESLint dev tree — as of the last
  check, 16 findings including one **critical** in `next` itself. Most of the
  significant ones are only fixed by major upgrades (`next` 16,
  `tailwindcss` 4, `eslint-config-next` 16), which are breaking changes. A
  handful of transitive ones (`brace-expansion`, `js-yaml`, `nanoid`,
  `fast-glob`, `source-map-js`) have non-major fixes that plain
  `npm audit fix` would take. Several of the `next` advisories don't apply to
  how this app is built — it uses no `rewrites()`, no Server Actions, and no
  `next/image` optimizer; every mutation is an explicit Route Handler under
  `/api`. Run `npm audit` yourself rather than trusting this paragraph's
  numbers, since new CVEs land continuously. **Don't attempt a major upgrade
  in the week you're teaching with this.**
- **Multiple accounts per person.** `alice+tag@school.org` and
  `alice@school.org` are distinct strings, so one student can register several
  accounts. Against an AMM that enables price manipulation: alt accounts buy
  to push a stock up, the main account sells into the inflated price. This
  predates the email field — a username alone was always enough — and the real
  defence is that staff see the entire roster in **Admin → Users**. Blocking
  `+` addressing is a product decision, not a bug fix.
- **Delisted holdings can't be sold but still count at full value.** Drift
  skips delisted companies so the price freezes, and `executeTrade` rejects
  trades on them, while net worth still counts the position. Late in a term
  that makes a delisted stock an accidental risk-free hedge, which works
  against "most money after 5 days." Left as-is deliberately; it's a
  game-balance call, not a defect.

---

## 3. Roles

| Role | Companies | Events | Market cycle | Game settings | Reset game | Other accounts |
|---|---|---|---|---|---|---|
| Student | trade only | view only | not visible | — | — | — |
| Teacher | add/edit/delist | trigger | view + override | adjust starting cash | yes | reset password, rename — **students only** |
| Owner | add/edit/delist, **delete** | trigger | view + override | adjust starting cash | yes | reset password, rename, deactivate, delete — **anyone** |

Everyone can change their own password and edit their own name on their
profile page, whatever their role.

Resetting a password or renaming an account is restricted *by the target's
role*, not just the caller's: teachers act on students, the owner acts on
anyone. The reason is specific to password resets — setting a hash directly is
account takeover, so a teacher able to reset the owner could promote
themselves — and renaming follows the same rule for consistency.

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
distort existing trades, but volatility can be tuned anytime). The implied
opening price (`pool cash ÷ pool shares`) is bounded to **$0.01–$1,000,000**
and pool shares to at least 1: outside that range the price either rounds to
zero or overflows `price_history`'s `numeric(18,6)`, which previously saved
the company and *then* failed, leaving it with no opening price point. The
insert and that first price point now share one transaction. The same screen
delists and relists existing companies, and the owner can delete them
outright. Twenty placeholder companies across 7 sectors
are seeded by `db/seed.sql`; replace or extend them at any time, no code
changes required.

## 6. Adding more random event types

Event templates live in the `event_templates` table and are picked at
random (weighted) whenever an event fires — either manually from **Admin →
Market events** or via the optional daily cron job (see 1.4). A template's
`weight` is honoured exactly (probability = `weight / total`) via an
exponential-variate draw; the obvious-looking `order by random() * weight` is
**wrong** — it takes the max of scaled uniforms, which the heaviest templates
dominate, and with the seeded weights it fired the rarest three types
essentially never. Templates that can't apply at that moment (a relist when
nothing is delisted) are skipped rather than throwing. Add a new row to
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
      errors.ts                        -- isUniqueViolation(), unwrapping Drizzle's error wrapper
    services/                          -- ALL business logic lives here, never in route handlers
      trades.ts                        -- executeTrade: the one authoritative trade path
      drift.ts                         -- applyAmbientDrift: the no-worker market tick
      regime.ts                        -- bull/bear/neutral cycle + buildRegimeTimeline
      events.ts                        -- market event templates and effects
      users.ts                         -- login lookup, password reset, rename, deactivate
      auth.ts                          -- signup
      admin.ts                         -- companies, game settings, resetGame
      quotes.ts, leaderboard.ts, profile.ts, students.ts, recap.ts, export.ts
    session.ts                         -- requireProfile/requireAdmin/requireOwner
    validation.ts                      -- zod schemas (all of them)
    rateLimit.ts                       -- login, trade and general-purpose limiters + getClientIp
    amm.ts                             -- client-side trade preview math (never trusted server-side)
    types.ts                           -- shared app-level types
HANDOFF.md                             -- cold-start notes for a new contributor/agent
```

A few conventions worth keeping:

- Route handlers do **auth → rate limit → parse → delegate → map errors to
  status codes**, and nothing else. Business logic goes in
  `src/lib/services/*`.
- `executeTrade` is the **only** authoritative trade path. It uses
  `SELECT … FOR UPDATE` inside `withTransaction`. Don't write a second one,
  and never let the client send a price — only a share quantity.
- Each failure mode gets its own error class (`SignupError`,
  `PasswordPolicyError`, `ResetNotPermittedError`, `RenameNotPermittedError`,
  `EventError`) so routes can map it to the right status code.
- There is **no automated test suite.** Verification is a manual loop against
  a local Postgres — see `HANDOFF.md` for the setup and the traps.
- Comments here explain *why*, and often record the failure that motivated the
  code. That's deliberate; please match it.
