-- ============================================================================
-- BUS-EX: seed data
--   - 20 placeholder parody companies with seeded AMM liquidity pools
--   - A starter pool of random market event templates
--
-- Run this once, after db/schema.sql, on a fresh database. Teacher/owner
-- accounts are NOT created here -- see the "Pre-creating admin accounts"
-- section of the README for the insert statement that creates them with a
-- properly bcrypt-hashed password.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Companies (20 parody / joke brands across 7 sectors)
-- Starting price = starting_pool_cash / starting_pool_shares
-- ----------------------------------------------------------------------------

-- volatility scales each company's ambient-drift range (see db/schema.sql
-- and src/lib/services/drift.ts) -- below 1.0 is a steadier "blue chip",
-- above 1.0 is a wilder mover. Picked to match each company's personality:
-- hype-driven/trend-chasing brands swing harder than boring utilities.
insert into companies (
  name, ticker, description, sector,
  pool_cash, pool_shares, total_shares, starting_pool_cash, starting_pool_shares, volatility
) values
  ('Wi-Fi Woes Inc.', 'WIFI',
   'Your internet is "99.9% reliable" -- it is always the 0.1%.',
   'tech', 60000, 5000, 5000, 60000, 5000, 0.6),

  ('Homework.exe', 'HWEXE',
   'AI tutoring bots that are extremely confident and occasionally correct.',
   'tech', 100000, 4000, 4000, 100000, 4000, 1.3),

  ('Cloud Nein GmbH', 'CLNINE',
   'We store your files in the cloud. Which cloud? Great question.',
   'tech', 48000, 6000, 6000, 48000, 6000, 0.7),

  ('Cryptid Energy', 'CRYPD',
   'Sasquatch-endorsed energy drinks. Wings not included, side effects may include.',
   'food', 48000, 8000, 8000, 48000, 8000, 2.2),

  ('Gluten Free For All', 'GFFA',
   'Every product is gluten free. Some products are also bread.',
   'food', 75000, 5000, 5000, 75000, 5000, 0.6),

  ('Mystery Meat Co.', 'MYST',
   'Cafeteria-grade protein, now available for retail purchase. Ingredients: yes.',
   'food', 30000, 10000, 10000, 30000, 10000, 1.8),

  ('Chairman Meow Pet Supply', 'MEOW',
   'Luxury goods for cats who have unionized and are demanding severance.',
   'retail', 80000, 4000, 4000, 80000, 4000, 1.1),

  ('Broke Boi Sneakers', 'BROKE',
   'Limited-edition sneakers that are, ironically, priced to make you broke.',
   'retail', 100000, 2500, 2500, 100000, 2500, 2.5),

  ('Snooze Button Mattresses', 'SNOOZ',
   'Ship-in-a-box mattresses endorsed by every student who skipped first period.',
   'retail', 81000, 4500, 4500, 81000, 4500, 0.5),

  ('Sparky''s Electric Scooters', 'SPARK',
   'Scooters that go from 0 to "why is it beeping" in 3 seconds.',
   'auto', 90000, 3000, 3000, 90000, 3000, 1.6),

  ('Buffer Bros. Streaming', 'BUFFR',
   'Unlimited movies and shows, none of which will finish loading.',
   'entertainment', 99000, 4500, 4500, 99000, 4500, 1.4),

  ('Deadline Espresso Co.', 'DEDLN',
   'Coffee strong enough to finish the essay that was due four hours ago.',
   'food', 63000, 7000, 7000, 63000, 7000, 1.0),

  ('Group Project Insurance', 'GRPIN',
   'Covers you when your group members "will do it tonight, I promise."',
   'finance', 70000, 5000, 5000, 70000, 5000, 0.5),

  ('Rickroll Records', 'RICK',
   'Never gonna give you up. Never gonna let your portfolio down. Probably.',
   'entertainment', 45000, 9000, 9000, 45000, 9000, 2.3),

  ('Formal Wear 4 Prom', 'PROM',
   'Rent a tux for one night, spend the rest of the year paying it off.',
   'fashion', 94500, 3500, 3500, 94500, 3500, 1.5),

  ('Lint Roller Industries', 'LINT',
   'Removing pet hair from your one good sweater since forever.',
   'retail', 66000, 6000, 6000, 66000, 6000, 0.4),

  ('Yeet Athletics', 'YEET',
   'Performance sportswear for a sport that has not been invented yet.',
   'fashion', 99000, 3000, 3000, 99000, 3000, 2.4),

  ('Group Chat Wireless', 'GCWI',
   'Unlimited data, unlimited notifications, zero unlimited peace of mind.',
   'tech', 85000, 5000, 5000, 85000, 5000, 1.0),

  ('Parking Karma App', 'PARKK',
   'Tells you exactly where a spot opened up four minutes after you left.',
   'tech', 56000, 8000, 8000, 56000, 8000, 1.2),

  ('Existential Dread Insurance', 'DREAD',
   'A modest monthly premium against the 3am realization that finals are next week.',
   'finance', 85500, 4500, 4500, 85500, 4500, 0.5)
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
