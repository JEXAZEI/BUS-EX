-- ============================================================================
-- BUS-EX: JEX-style classroom stock exchange
-- Migration 0001: core schema, RLS policies, and security-definer functions
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh
-- project, before 0002_seed.sql.
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
-- default student role. Managed by the owner. Never exposed to normal
-- authenticated clients (see RLS below) -- only read by the signup trigger
-- (SECURITY DEFINER) and by owner-only admin API routes using the service
-- role key.
create table admin_allowlist (
  email text primary key,
  role user_role not null check (role in ('teacher', 'owner')),
  created_at timestamptz not null default now()
);

-- One row per auth.users row. This is the "public" identity + wallet.
-- cash_balance is authoritative and is NEVER written directly by clients --
-- only by the SECURITY DEFINER functions below (execute_trade, admin cash
-- adjustments, reset_game, the signup trigger).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role user_role not null default 'student',
  cash_balance numeric(14, 2) not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_role_idx on profiles (role);

-- A parody company. pool_cash / pool_shares form a constant-product (x*y=k)
-- AMM liquidity pool. Spot price is always pool_cash / pool_shares.
-- starting_pool_cash / starting_pool_shares are preserved so "reset for a new
-- term" can restore the market to its configured initial state without
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

-- A user's current position in a company. Written only by execute_trade /
-- reset_game (SECURITY DEFINER), never directly by clients.
create table holdings (
  user_id uuid not null references profiles (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  shares numeric(18, 4) not null default 0 check (shares >= 0),
  primary key (user_id, company_id)
);

-- Append-only trade log.
create table trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
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
  user_id uuid not null references profiles (id) on delete cascade,
  net_worth numeric(14, 2) not null,
  recorded_at timestamptz not null default now()
);

create index net_worth_snapshots_user_idx on net_worth_snapshots (user_id, recorded_at desc);

-- Reusable pool of random-event templates. Teacher/owner can add more
-- through the admin panel without touching code.
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
  triggered_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index events_created_idx on events (created_at desc);

-- Login-attempt log for rate limiting. Never exposed to any client role --
-- only touched by the login API route via the service-role key.
create table login_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_identifier_idx on login_attempts (identifier, attempted_at desc);

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------

-- True if the current authenticated user is a teacher or owner.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('teacher', 'owner')
  );
$$;

-- True if the current authenticated user is the owner.
create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- ----------------------------------------------------------------------------
-- New-user provisioning: fires for every new auth.users row, regardless of
-- whether it was created via client-side signUp or an admin API route.
-- Assigns role from admin_allowlist by email, otherwise defaults to student,
-- and seeds cash_balance from game_settings.
-- ----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_username text;
  v_starting_cash numeric(14, 2);
begin
  v_username := new.raw_user_meta_data ->> 'username';

  select role into v_role from admin_allowlist where email = new.email;
  if v_role is null then
    v_role := 'student';
  end if;

  select default_starting_cash into v_starting_cash from game_settings where id = 1;

  insert into profiles (id, username, role, cash_balance)
  values (new.id, v_username, v_role, coalesce(v_starting_cash, 1000));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- execute_trade: the ONLY way shares/cash can move. Recomputes everything
-- server-side against the constant-product pool; never trusts a
-- client-submitted price.
--
-- p_shares is always a positive share quantity. Buys spend cash from the
-- caller's balance into the pool; sells return cash from the pool to the
-- caller. Price is 100% determined by the pool state, never by the client.
-- ----------------------------------------------------------------------------

create or replace function execute_trade(
  p_company_id uuid,
  p_side trade_side,
  p_shares numeric
)
returns table (
  new_cash_balance numeric,
  new_holding_shares numeric,
  cash_amount numeric,
  price_per_share numeric,
  new_spot_price numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company companies%rowtype;
  v_k numeric;
  v_new_pool_cash numeric;
  v_new_pool_shares numeric;
  v_cash_amount numeric;
  v_price_per_share numeric;
  v_user_cash numeric;
  v_user_shares numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Share quantity must be positive';
  end if;

  select * into v_company from companies where id = p_company_id for update;
  if not found then
    raise exception 'Company not found';
  end if;
  if v_company.is_delisted then
    raise exception 'This company is currently delisted and cannot be traded';
  end if;

  select cash_balance into v_user_cash from profiles where id = v_uid for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  v_k := v_company.pool_cash * v_company.pool_shares;

  if p_side = 'buy' then
    v_new_pool_shares := v_company.pool_shares - p_shares;
    if v_new_pool_shares <= 0 then
      raise exception 'Not enough shares available in the market for that order';
    end if;
    v_new_pool_cash := v_k / v_new_pool_shares;
    v_cash_amount := round(v_new_pool_cash - v_company.pool_cash, 2);

    if v_cash_amount <= 0 then
      raise exception 'Invalid trade';
    end if;
    if v_cash_amount > v_user_cash then
      raise exception 'Insufficient cash balance for this purchase';
    end if;

    update profiles set cash_balance = cash_balance - v_cash_amount where id = v_uid;

    insert into holdings (user_id, company_id, shares)
    values (v_uid, p_company_id, p_shares)
    on conflict (user_id, company_id)
    do update set shares = holdings.shares + excluded.shares;

    update companies
    set pool_cash = v_new_pool_cash,
        pool_shares = v_new_pool_shares,
        updated_at = now()
    where id = p_company_id;

  elsif p_side = 'sell' then
    select shares into v_user_shares
    from holdings where user_id = v_uid and company_id = p_company_id for update;

    if v_user_shares is null or v_user_shares < p_shares then
      raise exception 'You do not own enough shares to sell that amount';
    end if;

    v_new_pool_shares := v_company.pool_shares + p_shares;
    v_new_pool_cash := v_k / v_new_pool_shares;
    v_cash_amount := round(v_company.pool_cash - v_new_pool_cash, 2);

    if v_cash_amount <= 0 or v_cash_amount >= v_company.pool_cash then
      raise exception 'Invalid trade';
    end if;

    update profiles set cash_balance = cash_balance + v_cash_amount where id = v_uid;

    update holdings set shares = shares - p_shares
    where user_id = v_uid and company_id = p_company_id;

    update companies
    set pool_cash = v_new_pool_cash,
        pool_shares = v_new_pool_shares,
        updated_at = now()
    where id = p_company_id;

  else
    raise exception 'Invalid trade side';
  end if;

  v_price_per_share := round(v_cash_amount / p_shares, 6);

  insert into trades (user_id, company_id, side, shares, cash_amount, price_per_share)
  values (v_uid, p_company_id, p_side, p_shares, v_cash_amount, v_price_per_share);

  insert into price_history (company_id, price)
  values (p_company_id, round(v_new_pool_cash / v_new_pool_shares, 6));

  select cash_balance into new_cash_balance from profiles where id = v_uid;
  select shares into new_holding_shares from holdings
    where user_id = v_uid and company_id = p_company_id;

  cash_amount := v_cash_amount;
  price_per_share := v_price_per_share;
  new_spot_price := round(v_new_pool_cash / v_new_pool_shares, 6);

  return next;
end;
$$;

grant execute on function execute_trade(uuid, trade_side, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin: company management (teacher/owner only, enforced inside function)
-- ----------------------------------------------------------------------------

create or replace function admin_upsert_company(
  p_id uuid,
  p_name text,
  p_ticker text,
  p_description text,
  p_sector text,
  p_starting_pool_cash numeric,
  p_starting_pool_shares numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Only teachers/owners can manage companies';
  end if;
  if p_starting_pool_cash <= 0 or p_starting_pool_shares <= 0 then
    raise exception 'Starting pool cash and shares must be positive';
  end if;

  if p_id is null then
    insert into companies (
      name, ticker, description, sector,
      pool_cash, pool_shares, total_shares,
      starting_pool_cash, starting_pool_shares
    ) values (
      p_name, p_ticker, coalesce(p_description, ''), coalesce(p_sector, 'general'),
      p_starting_pool_cash, p_starting_pool_shares, p_starting_pool_shares,
      p_starting_pool_cash, p_starting_pool_shares
    )
    returning id into v_id;

    insert into price_history (company_id, price)
    values (v_id, round(p_starting_pool_cash / p_starting_pool_shares, 6));
  else
    update companies
    set name = p_name,
        ticker = p_ticker,
        description = coalesce(p_description, ''),
        sector = coalesce(p_sector, 'general'),
        updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function admin_upsert_company(uuid, text, text, text, text, numeric, numeric) to authenticated;

create or replace function admin_set_company_delisted(p_company_id uuid, p_delisted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only teachers/owners can delist/relist companies';
  end if;

  update companies set is_delisted = p_delisted, updated_at = now()
  where id = p_company_id;
end;
$$;

grant execute on function admin_set_company_delisted(uuid, boolean) to authenticated;

-- Teacher/owner: adjust the starting cash new signups (and `reset_game`)
-- grant students. Does not retroactively change existing balances.
create or replace function admin_set_starting_cash(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only teachers/owners can change starting cash';
  end if;
  if p_amount <= 0 then
    raise exception 'Starting cash must be positive';
  end if;

  update game_settings set default_starting_cash = p_amount, updated_at = now() where id = 1;
end;
$$;

grant execute on function admin_set_starting_cash(numeric) to authenticated;

-- Exposes the current default starting cash to admins only (game_settings
-- itself has no client-facing RLS policy).
create or replace function admin_get_game_settings()
returns table (default_starting_cash numeric)
language sql
stable
security definer
set search_path = public
as $$
  select default_starting_cash from game_settings where id = 1 and is_admin();
$$;

grant execute on function admin_get_game_settings() to authenticated;

-- ----------------------------------------------------------------------------
-- Random / manual market events
-- ----------------------------------------------------------------------------

create or replace function apply_price_shock(p_company_id uuid, p_impact_pct numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factor numeric;
  v_company companies%rowtype;
  v_new_cash numeric;
  v_new_shares numeric;
  v_new_price numeric;
begin
  select * into v_company from companies where id = p_company_id for update;
  if not found or v_company.is_delisted then
    return null;
  end if;

  v_factor := 1 + p_impact_pct;
  if v_factor <= 0.01 then
    v_factor := 0.01;
  end if;

  -- Keep k = pool_cash * pool_shares constant while scaling spot price
  -- (pool_cash / pool_shares) by v_factor:
  --   new_cash = cash * sqrt(factor), new_shares = shares / sqrt(factor)
  v_new_cash := v_company.pool_cash * sqrt(v_factor);
  v_new_shares := v_company.pool_shares / sqrt(v_factor);

  update companies
  set pool_cash = v_new_cash, pool_shares = v_new_shares, updated_at = now()
  where id = p_company_id;

  v_new_price := round(v_new_cash / v_new_shares, 6);

  insert into price_history (company_id, price) values (p_company_id, v_new_price);

  return v_new_price;
end;
$$;

-- Internal worker shared by the admin-triggered and system/cron-triggered
-- entry points below. Not exposed directly to any client role.
create or replace function run_market_event(
  p_template_id uuid,
  p_triggered_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template event_templates%rowtype;
  v_company companies%rowtype;
  v_event_id uuid;
  v_impact_pct numeric;
  v_cash_amount numeric;
  v_title text;
  v_description text;
  v_affected uuid[] := '{}';
  v_sector text;
begin
  if p_template_id is null then
    select * into v_template from event_templates
    where is_active
    order by random() * weight desc
    limit 1;
  else
    select * into v_template from event_templates where id = p_template_id;
  end if;

  if not found or v_template.id is null then
    raise exception 'No event template available';
  end if;

  if v_template.event_type in ('price_shock', 'scandal_delist', 'relist') then
    select * into v_company from companies
    where is_delisted = (v_template.event_type = 'relist')
    order by random() limit 1;

    if not found then
      raise exception 'No eligible company for this event';
    end if;
    v_affected := array[v_company.id];
  end if;

  if v_template.event_type = 'price_shock' then
    v_impact_pct := v_template.min_impact_pct
      + random() * (v_template.max_impact_pct - v_template.min_impact_pct);
    perform apply_price_shock(v_company.id, v_impact_pct);
    v_title := replace(v_template.title_template, '{company}', v_company.name);
    v_description := replace(replace(v_template.description_template, '{company}', v_company.name),
      '{pct}', to_char(v_impact_pct * 100, 'FM990.0') || '%');

  elsif v_template.event_type = 'scandal_delist' then
    update companies set is_delisted = true, updated_at = now() where id = v_company.id;
    v_title := replace(v_template.title_template, '{company}', v_company.name);
    v_description := replace(v_template.description_template, '{company}', v_company.name);

  elsif v_template.event_type = 'relist' then
    update companies set is_delisted = false, updated_at = now() where id = v_company.id;
    v_title := replace(v_template.title_template, '{company}', v_company.name);
    v_description := replace(v_template.description_template, '{company}', v_company.name);

  elsif v_template.event_type = 'sector_move' then
    select sector into v_sector from companies
    where not is_delisted
    order by random() limit 1;

    v_impact_pct := v_template.min_impact_pct
      + random() * (v_template.max_impact_pct - v_template.min_impact_pct);

    select array_agg(id) into v_affected from companies
    where sector = v_sector and not is_delisted;

    perform apply_price_shock(id, v_impact_pct) from companies
    where sector = v_sector and not is_delisted;

    v_title := replace(v_template.title_template, '{sector}', v_sector);
    v_description := replace(replace(v_template.description_template, '{sector}', v_sector),
      '{pct}', to_char(v_impact_pct * 100, 'FM990.0') || '%');

  elsif v_template.event_type in ('cash_bonus', 'cash_tax') then
    v_cash_amount := round(v_template.min_cash + random() * (v_template.max_cash - v_template.min_cash), 2);
    if v_template.event_type = 'cash_tax' then
      update profiles set cash_balance = greatest(cash_balance - v_cash_amount, 0)
      where role = 'student' and is_active;
    else
      update profiles set cash_balance = cash_balance + v_cash_amount
      where role = 'student' and is_active;
    end if;
    v_title := v_template.title_template;
    v_description := replace(v_template.description_template, '{amount}',
      '$' || to_char(v_cash_amount, 'FM999,999,990.00'));
  end if;

  insert into events (
    event_type, title, description, affected_company_ids,
    price_impact_pct, cash_impact, triggered_by
  ) values (
    v_template.event_type, v_title, v_description, v_affected,
    v_impact_pct, v_cash_amount, p_triggered_by
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- Manual trigger, called from the admin panel. Requires the caller to be a
-- signed-in teacher/owner; records them as the event's triggered_by.
create or replace function trigger_market_event(
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only teachers/owners can trigger market events';
  end if;
  return run_market_event(p_template_id, auth.uid());
end;
$$;

grant execute on function trigger_market_event(uuid) to authenticated;

-- System/cron entry point for scheduled random events (see
-- /api/cron/random-event and vercel.json). No admin check -- this must only
-- ever be reachable via the service-role key from a trusted server route
-- that itself verifies a secret cron token, never directly from a browser.
-- triggered_by is left null so the event feed reads as "the market" rather
-- than any specific person.
create or replace function trigger_market_event_system(
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return run_market_event(p_template_id, null);
end;
$$;

revoke all on function trigger_market_event_system(uuid) from public, anon, authenticated;
grant execute on function trigger_market_event_system(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Owner/teacher: reset the game for a new semester
-- ----------------------------------------------------------------------------

create or replace function reset_game()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starting_cash numeric(14, 2);
begin
  if not is_admin() then
    raise exception 'Only teachers/owners can reset the game';
  end if;

  select default_starting_cash into v_starting_cash from game_settings where id = 1;

  delete from trades;
  delete from price_history;
  delete from net_worth_snapshots;
  delete from events;
  delete from holdings;

  update profiles set cash_balance = coalesce(v_starting_cash, 1000) where role = 'student';

  update companies
  set pool_cash = starting_pool_cash,
      pool_shares = starting_pool_shares,
      total_shares = starting_pool_shares,
      is_delisted = false,
      updated_at = now();

  insert into price_history (company_id, price)
  select id, round(starting_pool_cash / starting_pool_shares, 6) from companies;
end;
$$;

grant execute on function reset_game() to authenticated;

-- ----------------------------------------------------------------------------
-- Net worth snapshot helper (called by an API route, e.g. on profile view or
-- a periodic cron, to build the "net worth over time" chart)
-- ----------------------------------------------------------------------------

create or replace function snapshot_my_net_worth()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cash numeric;
  v_holdings_value numeric;
  v_net_worth numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select cash_balance into v_cash from profiles where id = v_uid;

  select coalesce(sum(h.shares * (c.pool_cash / c.pool_shares)), 0)
  into v_holdings_value
  from holdings h
  join companies c on c.id = h.company_id
  where h.user_id = v_uid;

  v_net_worth := v_cash + v_holdings_value;

  insert into net_worth_snapshots (user_id, net_worth) values (v_uid, v_net_worth);

  return v_net_worth;
end;
$$;

grant execute on function snapshot_my_net_worth() to authenticated;

-- ----------------------------------------------------------------------------
-- Username availability check (usable by anon during signup, before an
-- auth session exists)
-- ----------------------------------------------------------------------------

create or replace function is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from profiles where lower(username) = lower(p_username));
$$;

grant execute on function is_username_available(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Anonymized recent-trades feed for a company's public detail page.
-- Deliberately omits user_id/username -- individual students' trade history
-- stays private (see the trades_select_own RLS policy below); this only
-- exposes aggregate market activity ("someone bought 5 shares at $12.30").
-- ----------------------------------------------------------------------------

create or replace function recent_company_trades(p_company_id uuid, p_limit int default 20)
returns table (
  side trade_side,
  shares numeric,
  price_per_share numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.side, t.shares, t.price_per_share, t.created_at
  from trades t
  where t.company_id = p_company_id
    and auth.role() = 'authenticated'
  order by t.created_at desc
  limit least(p_limit, 50);
$$;

grant execute on function recent_company_trades(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table companies enable row level security;
alter table holdings enable row level security;
alter table trades enable row level security;
alter table price_history enable row level security;
alter table net_worth_snapshots enable row level security;
alter table events enable row level security;
alter table event_templates enable row level security;
alter table admin_allowlist enable row level security;
alter table login_attempts enable row level security;
alter table game_settings enable row level security;

-- profiles: everyone can read their own row; admins can read all (for the
-- admin panel). No one gets UPDATE/INSERT/DELETE from the client -- those
-- only happen through SECURITY DEFINER functions or the service-role key.
create policy profiles_select_own on profiles
  for select using (id = auth.uid() or is_admin());

-- companies: readable by any signed-in classmate (no anonymous access at
-- all, per requirements); writes only via admin_* functions.
create policy companies_select_authenticated on companies
  for select using (auth.role() = 'authenticated');

-- holdings: users see only their own positions; admins can see all for
-- oversight. No direct writes from clients.
create policy holdings_select_own on holdings
  for select using (user_id = auth.uid() or is_admin());

-- trades: users see only their own trade history; admins can see all.
create policy trades_select_own on trades
  for select using (user_id = auth.uid() or is_admin());

-- price_history: public market data to any signed-in user.
create policy price_history_select_authenticated on price_history
  for select using (auth.role() = 'authenticated');

-- net_worth_snapshots: users see only their own; admins can see all.
create policy net_worth_select_own on net_worth_snapshots
  for select using (user_id = auth.uid() or is_admin());

-- events: the news ticker/feed is visible to every signed-in user.
create policy events_select_authenticated on events
  for select using (auth.role() = 'authenticated');

-- event_templates: internal to admins only (students shouldn't be able to
-- read impact ranges and "game the" upcoming events).
create policy event_templates_select_admin on event_templates
  for select using (is_admin());
create policy event_templates_write_admin on event_templates
  for all using (is_admin()) with check (is_admin());

-- admin_allowlist, login_attempts, game_settings: no client access at all.
-- admin_allowlist is only read by the SECURITY DEFINER signup trigger and by
-- owner-only server routes using the service-role key (which bypasses RLS).
-- game_settings is only readable/writable via service-role admin routes.
-- (No policies are created for these tables -> RLS defaults to deny-all for
-- anon/authenticated, which is exactly what we want.)
