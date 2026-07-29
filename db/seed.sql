-- ============================================================================
-- BUS-EX: seed data
--   - Owner/teacher email allowlist (edit before running if needed)
--   - 10 placeholder parody companies with seeded AMM liquidity pools
--   - A starter pool of random market event templates
--
-- Run this once, after db/schema.sql, on a fresh database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Admin allowlist
-- Whoever signs up (through the normal signup form) and enters one of these
-- email addresses in the optional "teacher/admin email" field is
-- automatically granted that role instead of 'student'. Login is still
-- always by username -- this is only checked once, at signup.
-- ----------------------------------------------------------------------------

insert into admin_allowlist (email, role) values
  ('ar9654@susd12.org', 'owner'),
  ('anad@susd12.org', 'teacher')
on conflict (email) do update set role = excluded.role;

-- ----------------------------------------------------------------------------
-- Companies (10 parody / joke brands across 4 sectors)
-- Starting price = starting_pool_cash / starting_pool_shares
-- ----------------------------------------------------------------------------

insert into companies (
  name, ticker, description, sector,
  pool_cash, pool_shares, total_shares, starting_pool_cash, starting_pool_shares
) values
  ('Wi-Fi Woes Inc.', 'WIFI',
   'Your internet is "99.9% reliable" -- it is always the 0.1%.',
   'tech', 60000, 5000, 5000, 60000, 5000),

  ('Homework.exe', 'HWEXE',
   'AI tutoring bots that are extremely confident and occasionally correct.',
   'tech', 100000, 4000, 4000, 100000, 4000),

  ('Cloud Nein GmbH', 'CLNINE',
   'We store your files in the cloud. Which cloud? Great question.',
   'tech', 48000, 6000, 6000, 48000, 6000),

  ('Cryptid Energy', 'CRYPD',
   'Sasquatch-endorsed energy drinks. Wings not included, side effects may include.',
   'food', 48000, 8000, 8000, 48000, 8000),

  ('Gluten Free For All', 'GFFA',
   'Every product is gluten free. Some products are also bread.',
   'food', 75000, 5000, 5000, 75000, 5000),

  ('Mystery Meat Co.', 'MYST',
   'Cafeteria-grade protein, now available for retail purchase. Ingredients: yes.',
   'food', 30000, 10000, 10000, 30000, 10000),

  ('Chairman Meow Pet Supply', 'MEOW',
   'Luxury goods for cats who have unionized and are demanding severance.',
   'retail', 80000, 4000, 4000, 80000, 4000),

  ('Broke Boi Sneakers', 'BROKE',
   'Limited-edition sneakers that are, ironically, priced to make you broke.',
   'retail', 100000, 2500, 2500, 100000, 2500),

  ('Snooze Button Mattresses', 'SNOOZ',
   'Ship-in-a-box mattresses endorsed by every student who skipped first period.',
   'retail', 81000, 4500, 4500, 81000, 4500),

  ('Sparky''s Electric Scooters', 'SPARK',
   'Scooters that go from 0 to "why is it beeping" in 3 seconds.',
   'auto', 90000, 3000, 3000, 90000, 3000)
on conflict (ticker) do nothing;

-- Seed the initial price point for each company so the price chart has a
-- starting value.
insert into price_history (company_id, price)
select id, round(pool_cash / pool_shares, 6) from companies;

-- ----------------------------------------------------------------------------
-- Random market event templates
-- Placeholders: {company}, {sector}, {pct}, {amount} get substituted by
-- src/lib/services/events.ts when an event actually fires.
-- ----------------------------------------------------------------------------

insert into event_templates
  (event_type, title_template, description_template, min_impact_pct, max_impact_pct, min_cash, max_cash, weight, is_active)
values
  ('price_shock', '{company} shares surge!',
   'Investors go wild after {company} announces a mysterious "new formula." Shares move {pct}.',
   0.15, 0.45, null, null, 3, true),

  ('price_shock', '{company} stock craters',
   'A viral video shows {company}''s product doing something it really should not do. Shares move {pct}.',
   -0.45, -0.15, null, null, 3, true),

  ('price_shock', 'Influencer shoutout boosts {company}',
   'A random influencer with 40 followers posts about {company} and somehow it works. Shares move {pct}.',
   0.05, 0.25, null, null, 2, true),

  ('price_shock', '{company} recalls entire product line',
   'Turns out the recall was for "tasting too good" -- still, shares move {pct}.',
   -0.30, -0.05, null, null, 2, true),

  ('sector_move', 'Sector-wide rally in {sector}',
   'Analysts (a guy on the bus) predict big things for the {sector} sector. All {sector} stocks move {pct}.',
   0.10, 0.30, null, null, 2, true),

  ('sector_move', 'Sector-wide slump hits {sector}',
   'A new school-wide trend has everyone suddenly over the {sector} sector. All {sector} stocks move {pct}.',
   -0.30, -0.10, null, null, 2, true),

  ('scandal_delist', 'SCANDAL: {company} delisted!',
   '{company} has been caught in a scandal so embarrassing it has been pulled from trading until further notice.',
   null, null, null, null, 1, true),

  ('relist', '{company} relisted after scandal cools off',
   'After a groveling apology video, {company} is back on the exchange and open for trading again.',
   null, null, null, null, 1, true),

  ('cash_bonus', 'Surprise stimulus for every trader!',
   'The Bank of BUS-EX is feeling generous. Every trader receives a surprise cash bonus of {amount}.',
   null, null, 50, 250, 2, true),

  ('cash_tax', 'Emergency "market maintenance fee"',
   'The exchange needs to cover its server costs (a lie). Every trader is taxed {amount}.',
   null, null, 25, 100, 1, true);
