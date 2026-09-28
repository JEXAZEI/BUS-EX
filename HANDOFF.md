# BUS-EX — Project Handoff

**Repo:** `github.com/JEXAZEI/BUS-EX`
**Working branch:** `claude/jex-classroom-stock-exchange-y23a47` (the pre-live bug-hunt pass in §5b was pushed to `claude/charming-clarke-8k6snc`, which contains everything on this branch plus that pass)
**HEAD at time of writing:** `c9b577f` — *Add name editing for students and staff*
**Last updated:** 2026-09-28

---

## 1. What this is

A JEX-style classroom stock-exchange simulator for a high-school business class.
Students sign up, get virtual starting cash, and trade shares in parody companies
against a constant-product AMM. The stated goal of the game is **"most money after
5 days."**

Operating constraints that shaped almost every design decision:

- **~30 students per class, multiple class periods**, all behind **one school IP**
  (NAT). Any per-IP rate limit must tolerate a whole class at once.
- Students play in **~1-hour bursts** over a **5-day term**.
- Deployed on **Vercel free tier + Neon free Postgres**. **There is no background
  worker.** This is the single most important architectural fact — see §4.

---

## 2. Stack and layout

| Piece | Choice |
| --- | --- |
| Framework | Next.js 14, App Router, TypeScript |
| DB | Neon serverless Postgres via `pg` Pool + Drizzle (`drizzle-orm/node-postgres`) |
| Auth | Hand-rolled: bcryptjs (12 rounds) + opaque random session tokens |
| Styling | Tailwind (`darkMode: "class"`) |
| Charts | Recharts |
| Hosting | Vercel (app) + Neon (db) |

```
src/app/(app)/…      authed pages (dashboard, company, leaderboard, profile, admin/*)
src/app/(auth)/…     login, signup
src/app/api/…        route handlers
src/lib/services/…   all business logic (trades, drift, regime, events, users, export…)
src/lib/auth/…       password.ts, session.ts
src/lib/db/…         client.ts, schema.ts, mappers.ts, errors.ts
src/lib/validation.ts  every zod schema in one place
db/schema.sql        canonical DDL
db/seed.sql          20 parody companies + event templates
```

**Env vars:** `DATABASE_URL`, `CRON_SECRET`, `NODE_ENV`. That's all.

---

## 3. ⚠️ Read this before you change anything

### There is no migration runner
Schema changes are **manual SQL pasted into the Neon SQL Editor by the user.**
`db/schema.sql` is the canonical DDL for a *fresh* database; it is **not** replayed
against production. If you change the schema you must:

1. Update `db/schema.sql` (for fresh installs), **and**
2. Hand the user a separate, idempotent `ALTER TABLE …` script to run in Neon, **and**
3. Wait for them to confirm it ran before assuming the column exists.

Past failure worth knowing: a migration adding `email` did `UPDATE users SET email = …`
in a way that gave two admin accounts the same value, which then broke the
`users_email_lower_idx` unique index creation. The working fix used
`email = lower(username)`. **Test migration scripts against a local copy first.**

### The sandbox cannot reach the live site
`bus-ex.vercel.app` is unreachable from the agent container (proxy denies CONNECT
with 403). **All production verification must be done by the user.** Do not claim
anything about live behaviour you have not been told.

### The container wipes itself between sessions
`node_modules`, the local Postgres database, **and even the git checkout** have all
been reset mid-project. On 2026-09-28 the local checkout came back at an *older*
commit with two pushed commits missing locally — they were safe on `origin` and
recovered with `git fetch` + `git merge --ff-only`. **Always check
`git log origin/<branch>` before concluding work is missing.** Push early.

### Verify by execution, not by reading
Several real bugs in this project were invisible on inspection and only appeared
when the code was actually run (the Drizzle `.cause` bug, a 404-ing favicon, a
serverless timeout, a 25× timing side channel). The repeatable local harness is in §8.

---

## 4. The no-background-worker model (most important design)

Vercel's free tier has no always-on worker, so **the market only advances when
someone loads a page.** `applyAmbientDrift()` (`src/lib/services/drift.ts`) is
called opportunistically from the dashboard and company pages.

To stop a Friday→Monday gap showing as one flat line, a company that has fallen
behind is **backfilled** with one tick per missed interval, each written with its
own **historical timestamp**, so the chart looks like the market kept running.

Key constants:

| Constant | Value | Why |
| --- | --- | --- |
| `DRIFT_INTERVAL_MINUTES` | `3` | Gives the 1H chart ~20 real points. At 15 min it was 4 points and read as a flat line. |
| `MAX_CATCHUP_TICKS` | `1440` | = 72h of ticks. Also keeps the batched insert's bound params (1440 × 3 = 4320) well under Postgres's 65535 ceiling. |

Two hard-won lessons live in this file:

1. **Batch the writes.** The original code did ~3 DB round trips *per tick*. Over
   Neon's real latency from a Vercel function, a multi-day catch-up blew past the
   serverless timeout and killed the response mid-stream — the browser reported
   `TypeError: Error in input stream` and the dashboard rendered blank. Now it
   computes the whole sequence in memory and does **two** queries (one `UPDATE`,
   one multi-row `INSERT`). Worst case measured locally: **0.71s**.
2. **Lock the company row before counting ticks.** Two simultaneous page loads
   would otherwise each compute "72 hours behind" from the same last tick and each
   insert a full independent random walk, interleaving two diverging sequences over
   the same window.

### Market regimes
`src/lib/services/regime.ts` rotates bull / bear / neutral. Deliberately **never
shown to students** ("real markets don't announce their own trend"). Visible to
staff on `/admin`, and overridable there via `POST /api/admin/regime`
(field name is **`durationHours`**, max 240).

```
REGIME_BIAS            bull +0.0005, bear -0.0009, neutral 0   (per 3-min tick)
REGIME_DURATION_MINUTES bull 14–20h, neutral 8–12h, bear 5–9h
REGIME_WEIGHTS         bull 0.45, neutral 0.35, bear 0.2
IDIOSYNCRATIC_DRIFT_RANGE  [-0.0056, +0.0056]  (per company, per tick)
```

The asymmetry is intentional and is how "make it beatable / inclined upward" was
satisfied: bull is picked more often *and* lasts longer; bear is sharper but
shorter ("elevator down, stairs up").

`buildRegimeTimeline()` is built **once per drift pass and shared across all
companies** — the regime is market-wide, so two stocks backfilling the same minute
must agree on what the market was doing. Do not move this inside the per-company loop.

---

## 5. Work completed

Most recent three commits are the current session's; earlier ones are listed for context.

| Commit | Summary |
| --- | --- |
| `c9b577f` | Name editing for students (profile) and staff (Admin → Users) |
| `722c4c6` | Teachers can reset **student** passwords |
| `7d715dd` | Rate-limit bypass, login enumeration, single-regime backfill, CSV injection |
| `844a0b3` | Real name + email on accounts; log in with **either** username or email |
| `5bbf12b` | Password suggester on admin reset; show rejections inline |
| `d75c734` | 1H chart texture: 3-minute ticks, linear interpolation |
| `84d414b` | Common-password denylist on all three password-setting paths |
| `c979d1c` | Loosened signup rate limit so a real class can't lock itself out |
| `6e0dfaa` | Security audit: rate-limit every endpoint, revoke sessions on password change / deactivation |
| `a75b878` | Batch ambient drift's DB round trips (fixed the live dashboard crash) |
| `1b58a18` | Add missing favicon (was 404ing on every page load) |
| `4e9cdbd` | Fix unique-violation detection swallowed by Drizzle's error wrapper |
| `1a12f46` | Faster drift ticks; admin can set the market cycle |

### Bugs fixed in the most recent security pass (`7d715dd`)

**1. Rate limiter was fully bypassable — the most serious finding.**
`getClientIp` read the **first** entry of `X-Forwarded-For`, which is whatever the
client sent (a proxy *appends*, it does not replace). Reproduced: after 5 failures
locked an account, six requests with rotating `X-Forwarded-For` values all sailed
through, as did `'7.7.7.7, 9.9.9.9'` — the exact shape Vercel produces. Fixed to
prefer `x-vercel-forwarded-for` → `x-real-ip` → **last** hop of `X-Forwarded-For`.
*Still unverified in production: whether Vercel actually sets
`x-vercel-forwarded-for`. The fallback chain is safe either way.*

**2. Login leaked which accounts exist.** The "no such account" path returned before
running bcrypt: **13 ms vs 347 ms, zero overlap** — a trivially reliable enumeration
oracle that defeated the deliberately-shared generic error message. Fixed with
`burnPasswordComparison()` in `src/lib/auth/password.ts`, which runs a real bcrypt
compare against a throwaway hash. Both paths now ~0.35 s.

**3. No per-IP login ceiling**, despite a comment claiming one. Each account carried
its own 5-attempt budget, so one machine could walk the whole roster. Added a
second counter keyed on IP alone, reusing the `login_attempts` table via a distinct
identifier shape (`ip-scope::<ip>`) so **no schema change was needed**. Set to
**200 failures / 15 min** — deliberately generous because of the NAT constraint.

**4. Ambient drift replayed long gaps under a single regime.** The regime was
sampled once and reused for all 1440 backfill ticks. Simulated with the project's
own constants, a 60-hour weekend gap on a volatility-2.5 company landed at **6% of
its pre-gap price under bear and 437% under bull** — a 70× swing decided by one coin
flip the moment a student opened the dashboard on Monday. Fixed with
`buildRegimeTimeline()`. Measured after the fix: medians cluster **100–145%** with
genuinely mixed trends (33 hours up / 19 down over a 60-hour window).

**5. CSV formula injection.** Validation legitimately allows a leading `-` in names
(hyphenated names) and a leading `+`, `@` or `-` in usernames/emails — all formula
lead-ins. `-Alice`, `@evil002`, `+e3@susd12.org` all became `#NAME?` in the
teacher's gradebook. Fixed with an apostrophe guard on **text columns only**;
numeric columns are left alone so sorting still works. CSV *structure* was never at
risk — no commas, quotes or newlines can pass validation.

### Features added after that

**Teacher password reset (`722c4c6`).** Teachers reach `/admin/users` and can reset
any **student**. Deactivate/delete stay owner-only, and so does resetting a teacher
or owner — **writing a password hash directly is equivalent to account takeover**,
so a teacher who could reset the owner would be one request from self-promotion.
Enforced in `resetUserPassword` where the target's role is already loaded, not in
the route; the hidden buttons are cosmetic only.

**Name editing (`c9b577f`).** Everyone types their own name at signup and a name is
what the leaderboard, recap and CSV identify a student by, so typos were permanent.
Students fix their own on `/profile`; staff fix anyone's in Admin → Users, same
teacher/owner boundary.

Three design calls worth preserving:
- `POST /api/profile/name` takes **no `userId`** — it writes to the caller's session
  id, so it cannot be aimed at another account. Verified by posting the owner's id
  alongside a new name: caller renamed themselves, owner untouched.
- Renaming deliberately **does not** touch sessions or passwords. A reset revokes
  every session on purpose; a name is a display string, and logging a class out
  because someone fixed a misspelling would be its own problem.
- The 10/hour churn limit is checked **after** validation. Checking first meant every
  rejected format burned an attempt, so ten fumbles at `"Robert 123"` would lock a
  student out of fixing their own typo. Verified: 12 rejected attempts = 0 budget
  used; 12 real changes cut off at 10.

---

## 5b. Pre-live bug-hunt pass (after `c9b577f`)

Found by running the app (local Postgres + production build + Playwright), not by reading:

1. **Selling a whole position could 500.** Share quantities beyond 4 decimals were applied to the pool unrounded but stored rounded in `holdings`, so pool + holdings drifted past `total_shares` and the sell tripped `pool_shares_le_total`. `executeTrade` now quantizes to 4 dp first.
2. **Random events were badly skewed.** `order by random() * weight` is not weight-proportional: scandal, relist and tax each fired ~0% instead of ~5%, price shocks 81% instead of 53%. Now an exponential-variate pick, and templates that can't apply (relist with nothing delisted) are skipped instead of throwing.
3. **Recap "most active trader" grouped by name**, merging two students who share one. Now grouped by account.
4. **Password == email was only blocked at signup** (despite §6 saying otherwise); change-password and staff reset now use `passwordMatchesAccount`.
5. **Change-password's 5/15-min limit was spent by validation rejections** (denylist hits), locking students out with no wrong guess. Now checked after validation, like the name route.
6. **Malformed ids in `/company/[id]` and `/admin/students/[id]` were 500s**; now 404s via `isUuid`.
7. **`getCompanyQuotes` pulled the entire 25h price history (~10k rows, ~1.2 MB) on every render and 20s poll** just to find 20 baselines -- on the order of 200 MB/min of Neon egress for a class of 30. Now a lateral one-row-per-company index lookup (identical results, 20 rows).
8. **Company creation with an extreme cash/shares ratio 500'd and left a company with no price history.** Starting price is now bounded ($0.01-$1,000,000) and creation is one transaction.
9. **Profile / student-detail money cards clipped five-digit balances on phones.**

Also verified: 30 concurrent students (signup + 360 mixed trades/page loads + events) with zero 5xx and exact share conservation; reset flow end to end; 3-day drift backfill (0.56 s, prices 67-139% of start). README's stale drift/regime/roles facts were corrected.

## 6. Security model as it stands

- **Passwords:** bcryptjs, 12 rounds. Min 8 / max 72 chars, plus a
  ~70-entry common-password denylist (`COMMON_PASSWORDS` in `validation.ts`,
  including classroom-flavoured guesses like `student123`) and a rule blocking
  password == username or email (or the email's local part).
- **Sessions:** 32-byte random opaque tokens, **SHA-256 hashed before storage**
  (a DB leak alone can't forge one). Cookie `bus_ex_session`, httpOnly,
  `secure` in production, `sameSite=lax`, 30-day TTL. Expiry enforced server-side.
- **Session revocation** on password change, admin reset, and deactivation.
- **`is_active` checked on every API route and in `executeTrade`** — deactivating
  cuts access immediately.
- **Login:** single generic error `"Invalid login or password"` for both wrong
  password and unknown account, now genuinely constant-time (see fix 2).
- **Role gates:** every `/api/admin/*` route checks role explicitly. Page-level
  guards are `requireProfile` / `requireAdmin` / `requireOwner` in `src/lib/session.ts`.
- **Headers** in `next.config.js`: `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`.
- **Cron** (`/api/cron/random-event`) is guarded by `Bearer ${CRON_SECRET}`, not a
  session, because Vercel Cron sends no cookies. Returns **501** if the secret isn't set.
- **SQL injection:** everything goes through Drizzle or parameterized `pg` queries.
- **XSS:** React escapes by default; `fullNameSchema` and `usernameSchema` also
  reject angle brackets outright. Company names are admin-only and render escaped.

### Rate limits (all DB-backed, all **fail open** on DB error)

| Scope | Limit |
| --- | --- |
| Login, per (account, IP) | 5 failures / 15 min |
| Login, per IP | 200 failures / 15 min |
| Signup, per IP | 200 / 10 min *(deliberately high — NAT)* |
| Trades, per user | 10 / 10 s |
| Change password | 5 / 15 min |
| Own name | 10 / hour |
| Admin routes | 5–40 / min depending on destructiveness (`admin-reset` is 5/min) |

Fail-open is deliberate: failing closed would lock an entire class out on a
transient Neon blip. Errors are still logged.

---

## 7. Verified working (by execution)

Signup/login validation and case-insensitive duplicate handling on both identifiers;
username/email collision determinism (username wins, 5/5 runs); role-escalation via
a posted `role` field blocked; **12 concurrent buys against one balance → 1 committed,
11 rejected, no overdraft** (the `SELECT … FOR UPDATE` lock holds); authorization on
every admin endpoint across student/teacher/owner/anonymous; session forgery,
tampering, truncation and expiry; password change/reset with session revocation;
deactivation enforcement; end-of-term reset semantics; empty-state rendering on every
page right after a reset (0 server errors); long-gap drift performance and price
sanity; CSV export with adversarial names.

`npx tsc --noEmit`, `npx next lint` and `next build` are all clean at `c9b577f`.

---

## 8. Local verification harness

There are **no automated tests in this repo.** This is the manual loop that has
caught every real bug:

```bash
cd /home/user/BUS-EX
npm install                                    # container wipes node_modules
service postgresql start                       # or: pg_ctlcluster 16 main start

# One-time DB setup
sudo -u postgres psql -c "create role busex login password 'busexpw' superuser;" \
                     -c "create database busex_bh owner busex;"
export PGPASSWORD=busexpw
psql -h localhost -U busex -d busex_bh -v ON_ERROR_STOP=1 -f db/schema.sql
psql -h localhost -U busex -d busex_bh -v ON_ERROR_STOP=1 -f db/seed.sql

# Staff accounts need a REAL bcrypt hash — generate it, don't hand-write it
node -e "console.log(require('bcryptjs').hashSync('ClassroomTest99',12))"
# then INSERT owner + teacher rows with that hash

# Dev server (detached, or it dies with the tool call)
nohup env DATABASE_URL="postgresql://busex:busexpw@localhost:5432/busex_bh" \
  NODE_ENV=development npx next dev -p 3100 > /tmp/dev.log 2>&1 < /dev/null &
```

Then drive it with `curl -c/-b` cookie jars. Pre-commit sequence:
`npx tsc --noEmit` → `rm -rf .next tsconfig.tsbuildinfo` → `next build` with a
placeholder `DATABASE_URL` → `npx next lint`.

### Harness traps that have cost real time

- **Never `rm -rf .next` while the dev server is running.** It destroys the running
  server's chunks and every route starts returning
  `500 Cannot find module './NNNN.js'`. This looks exactly like an app bug. Stop the
  server first.
- **`psql … | tail && echo OK` reports success even when psql fails** — `tail`'s exit
  code wins. Don't pipe before `&&`.
- **Watch shell quoting in nested `$( … )` with escaped JSON.** A trade returning 400
  was traced to malformed JSON from over-nested quotes, not to the app. Don't use
  `-o /dev/null` on a request whose failure you might need to diagnose.
- The session cookie is **`bus_ex_session`**, not `busex_session`, and curl stores it
  as a `#HttpOnly_` line that `grep -v '^#'` strips.
- **Clear `login_attempts` / `api_hits` between test batches**, or the rate limiter
  silently short-circuits your test and you'll measure the wrong thing (this
  invalidated the first timing-oracle measurement).
- Playwright: Chromium is preinstalled at `/opt/pw-browsers/chromium`; set
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. **Never run `playwright install`.**

---

## 9. Outstanding items

### Blocking classroom readiness (both need the user — I can't do them)
1. **Deploy and smoke-test.** Three commits are unverified in production. Check
   specifically that a wrong password returns `"Invalid login or password"` and not
   a premature 429 (that would mean `getClientIp` is resolving every student to one
   bucket).
2. **Multi-person dry run.** 3–4 people or browser profiles signing up with the new
   name/email fields, trading simultaneously, hitting the leaderboard. This is the
   biggest remaining risk and nothing local substitutes for it.

### Known open issues (none are crashes)

- **Impersonation on the leaderboard.** The leaderboard now shows real names instead
  of `@username` (the user's explicit choice). Names are not unique — correctly, real
  people share them — so a student can rename themselves to exactly another
  student's name and the leaderboard won't distinguish them. Staff can see name *and*
  username in Admin → Users and fix it in seconds. **Open options:** leave it, or
  show a small `@username` beside the name. Not changed unilaterally because the
  user specifically asked for names there.
- **Delisted holdings count at full frozen value and can't be sold.** Drift skips
  delisted companies, so the price freezes; `executeTrade` rejects trades on them.
  Near the end of a term that makes a delisted stock a **risk-free hedge**, which
  cuts against "most money after 5 days." This is a game-design decision the user
  has not ruled on — **ask before changing it.**
- **8 high-severity `npm audit` advisories** against Next 14.2.35 whose fixes require
  a Next 15/16 major upgrade. Low practical risk for a closed classroom game;
  deliberately not attempted. Do **not** start this in the week the class runs.
- **Multi-account signup is possible** (`alice+tag@school.org` vs `alice@school.org`
  are distinct strings). With an AMM this enables price manipulation: alt accounts
  buy to inflate a stock, the main account sells into it. Pre-existing — usernames
  alone already allowed it — and the real defence is that staff see the whole roster.
  Blocking `+` addressing would be a product decision.

### Not verified at all
Anything about live production behaviour. Also: no automated test suite exists, so
every claim in §7 rests on the manual harness and would need re-running after changes.

---

## 10. Conventions to match

- **Comments explain *why*, not *what*,** and often record the failure that motivated
  the code (e.g. the batching comment in `drift.ts` names the serverless timeout).
  Match this density — it's the house style and it carries real institutional memory.
- Business logic lives in `src/lib/services/*`, never in route handlers. Routes do
  auth → rate limit → parse → delegate → map errors to status codes.
- **Authorization rules that depend on a target row's data go in the service**, where
  that row is already loaded (see `resetUserPassword`, `renameUserAsStaff`), so a
  future caller can't route around them.
- All zod schemas live in `src/lib/validation.ts`.
- `executeTrade` in `src/lib/services/trades.ts` is the **sole** authoritative trade
  path. It uses `SELECT … FOR UPDATE` inside `withTransaction`. Never write a second
  one, and never let the client send a price — only a share quantity.
- Custom error classes per failure mode (`SignupError`, `PasswordPolicyError`,
  `ResetNotPermittedError`, `RenameNotPermittedError`, `EventError`) so routes can
  map them to the right status.
- Commit messages are prose explaining the problem and the reasoning, not bullet
  lists of changed files.
- Push to `claude/jex-classroom-stock-exchange-y23a47`. **Do not open a PR unless
  explicitly asked.**
