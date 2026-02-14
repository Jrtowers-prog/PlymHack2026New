-- ══════════════════════════════════════════════════════════════════════
-- SafeNight — User Data Service Schema  (v2 — Feb 2026)
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Safe to re-run: uses DROP … CASCADE then CREATE, so it fully
-- recreates everything cleanly.  Back up data first if needed.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 0. Clean slate ──────────────────────────────────────────────────
-- Drop in reverse dependency order so foreign keys don't block us.
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.ensure_user_records(uuid, text, text);

drop table if exists public.reviews           cascade;
drop table if exists public.safety_reports    cascade;
drop table if exists public.usage_events      cascade;
drop table if exists public.live_sessions     cascade;
drop table if exists public.emergency_contacts cascade;
drop table if exists public.subscriptions     cascade;
drop table if exists public.feature_limits    cascade;
drop table if exists public.profiles          cascade;

-- ─── 1. Profiles ─────────────────────────────────────────────────────
-- Stores name, platform, app version, last seen.
-- Linked 1:1 with auth.users via id.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,                              -- cached from auth.users for quick lookups
  name          text not null default '',
  username      text unique,                       -- unique handle for QR pairing
  push_token    text,                              -- Expo push token for notifications
  platform      text not null default 'unknown',   -- android, ios, web
  app_version   text not null default '0.0.0',
  subscription  text not null default 'free',      -- free, pro, premium
  onboarded     boolean not null default false,    -- has completed onboarding flow
  disclaimer_accepted_at timestamptz,               -- null = not yet accepted; set once on first accept
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- ─── 1b. Subscriptions ───────────────────────────────────────────────
-- Full subscription history — tracks upgrades, downgrades, expirations.
create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  tier          text not null default 'free',      -- free, pro, premium
  status        text not null default 'active',    -- active, expired, cancelled
  started_at    timestamptz not null default now(),
  expires_at    timestamptz,                       -- null = never expires (free)
  cancelled_at  timestamptz,
  payment_ref   text,                              -- external payment ID (Stripe, RevenueCat, etc.)
  created_at    timestamptz not null default now()
);

-- ─── 2. Emergency Contacts (Buddy System) ───────────────────────────
-- Links two SafeNight users. Both must have the app.
-- Contact requests: pending → accepted / rejected / blocked.
create table public.emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contact_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending',   -- pending, accepted, rejected, blocked
  nickname      text not null default '',           -- optional friendly name
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, contact_id)                      -- no duplicate pairs
);

-- ─── 3. Live Sessions ────────────────────────────────────────────────
-- Active navigation / walking sessions for real-time location sharing.
-- Created when user starts walking, ended on arrival or manual stop.
create table public.live_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'active',  -- active, completed, cancelled
  current_lat     real,
  current_lng     real,
  destination_lat real,
  destination_lng real,
  destination_name text,                            -- friendly destination label
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  last_update_at  timestamptz not null default now()
);

-- ─── 4. Usage Events ────────────────────────────────────────────────
-- Flexible event log — one row per event, tiny per row.
-- event_type: app_open, route_search, navigation_start,
--             navigation_complete, navigation_abandon
create table public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null,
  value_num   real,               -- distance_km, safety_score, etc.
  value_text  text,               -- extra context (duration, version)
  created_at  timestamptz not null default now()
);

-- ─── 5. Safety Reports ──────────────────────────────────────────────
-- User-reported hazards with pinned location.
-- Categories: poor_lighting, unsafe_area, obstruction, harassment, other
create table public.safety_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  lat         real not null,
  lng         real not null,
  category    text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ─── 6. Reviews ─────────────────────────────────────────────────────
-- App reviews with 1-5 rating.
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating >= 1 and rating <= 5),
  comment     text not null default '',
  created_at  timestamptz not null default now()
);

-- ─── 7. Feature Limits (DB-driven tier config) ──────────────────────
-- Overrides the server-side defaults in subscriptionConfig.js.
-- If a row exists here for a feature+tier, the DB value wins.
-- This lets you tweak limits from Supabase dashboard without redeploying.
create table public.feature_limits (
  id          uuid primary key default gen_random_uuid(),
  feature     text not null,                       -- e.g. route_search, emergency_contacts
  tier        text not null,                       -- free, pro, premium
  max_count   integer not null default -1,         -- -1 = unlimited, 0 = disabled
  per_interval text,                               -- day, month, year, null = lifetime
  description text,
  updated_at  timestamptz not null default now(),
  unique (feature, tier)
);

-- Seed default limits (matches subscriptionConfig.js defaults)
insert into public.feature_limits (feature, tier, max_count, per_interval, description) values
  ('route_search',       'free',    10,  'day',   'Route safety searches'),
  ('route_search',       'pro',     -1,  null,    'Route safety searches'),
  ('route_search',       'premium', -1,  null,    'Route safety searches'),
  ('route_distance',     'free',    1,   null,    'Max route distance (km)'),
  ('route_distance',     'pro',     10,  null,    'Max route distance (km)'),
  ('route_distance',     'premium', 20,  null,    'Max route distance (km)'),
  ('navigation_start',   'free',    5,   'day',   'Navigation sessions'),
  ('navigation_start',   'pro',     -1,  null,    'Navigation sessions'),
  ('navigation_start',   'premium', -1,  null,    'Navigation sessions'),
  ('emergency_contacts', 'free',    2,   null,    'Emergency contacts (Safety Circle)'),
  ('emergency_contacts', 'pro',     5,   null,    'Emergency contacts (Safety Circle)'),
  ('emergency_contacts', 'premium', -1,  null,    'Emergency contacts (Safety Circle)'),
  ('live_sessions',      'free',    2,   'month', 'Live location sharing'),
  ('live_sessions',      'pro',     -1,  null,    'Live location sharing'),
  ('live_sessions',      'premium', -1,  null,    'Live location sharing'),
  ('ai_explanation',     'free',    2,   'day',   'AI route explanations'),
  ('ai_explanation',     'pro',     10,  'day',   'AI route explanations'),
  ('ai_explanation',     'premium', -1,  null,    'AI route explanations'),
  ('safety_reports',     'free',    -1,  null,    'Safety hazard reports'),
  ('safety_reports',     'pro',     -1,  null,    'Safety hazard reports'),
  ('safety_reports',     'premium', -1,  null,    'Safety hazard reports'),
  ('usage_stats',        'free',    -1,  null,    'Usage analytics'),
  ('usage_stats',        'pro',     -1,  null,    'Usage analytics'),
  ('usage_stats',        'premium', -1,  null,    'Usage analytics')
on conflict (feature, tier) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES — fast queries on common access patterns
-- ═══════════════════════════════════════════════════════════════════

create index idx_profiles_email     on public.profiles(email);
create index idx_username           on public.profiles(username);
create index idx_contacts_user      on public.emergency_contacts(user_id);
create index idx_contacts_contact   on public.emergency_contacts(contact_id);
create index idx_contacts_status    on public.emergency_contacts(status);
create index idx_live_user          on public.live_sessions(user_id);
create index idx_live_status        on public.live_sessions(status);
create index idx_usage_user         on public.usage_events(user_id);
create index idx_usage_type         on public.usage_events(event_type);
create index idx_usage_created      on public.usage_events(created_at);
create index idx_reports_loc        on public.safety_reports(lat, lng);
create index idx_reports_cat        on public.safety_reports(category);
create index idx_reports_created    on public.safety_reports(created_at);
create index idx_reviews_user       on public.reviews(user_id);
create index idx_subs_user          on public.subscriptions(user_id);
create index idx_subs_status        on public.subscriptions(status);
create index idx_feature_limits_ft  on public.feature_limits(feature, tier);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — users can only access their own data
-- Service role key bypasses RLS for server-side operations.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.live_sessions enable row level security;
alter table public.usage_events enable row level security;
alter table public.safety_reports enable row level security;
alter table public.reviews enable row level security;
alter table public.feature_limits enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Subscriptions: users can view their own subscription history
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Emergency contacts: users can see contacts where they are user or contact
create policy "Users can view own contacts"
  on public.emergency_contacts for select
  using (auth.uid() = user_id or auth.uid() = contact_id);

create policy "Users can insert contact requests"
  on public.emergency_contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update contacts they are part of"
  on public.emergency_contacts for update
  using (auth.uid() = user_id or auth.uid() = contact_id);

create policy "Users can delete own contacts"
  on public.emergency_contacts for delete
  using (auth.uid() = user_id or auth.uid() = contact_id);

-- Live sessions: users can manage their own sessions,
-- contacts can view sessions of their accepted contacts
create policy "Users can manage own live sessions"
  on public.live_sessions for all
  using (auth.uid() = user_id);

create policy "Contacts can view live sessions"
  on public.live_sessions for select
  using (
    exists (
      select 1 from public.emergency_contacts
      where status = 'accepted'
        and (
          (user_id = auth.uid() and contact_id = public.live_sessions.user_id)
          or (contact_id = auth.uid() and user_id = public.live_sessions.user_id)
        )
    )
  );

-- Usage events: users can insert their own events, read their own
create policy "Users can insert own usage events"
  on public.usage_events for insert
  with check (auth.uid() = user_id);

create policy "Users can view own usage events"
  on public.usage_events for select
  using (auth.uid() = user_id);

-- Safety reports: users can insert, read all (public safety data)
create policy "Users can insert reports"
  on public.safety_reports for insert
  with check (auth.uid() = user_id);

create policy "Anyone can view reports"
  on public.safety_reports for select
  using (true);

create policy "Users can delete own reports"
  on public.safety_reports for delete
  using (auth.uid() = user_id);

-- Reviews: users can insert their own, read all
create policy "Users can insert reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Anyone can view reviews"
  on public.reviews for select
  using (true);

-- Feature limits: readable by any authenticated user (for UI display)
create policy "Authenticated users can view feature limits"
  on public.feature_limits for select
  using (true);

-- ═══════════════════════════════════════════════════════════════════
-- REUSABLE FUNCTION — ensure_user_records
-- Creates profile + default subscription + first usage event if they
-- don't already exist. Called from the signup trigger AND from the
-- server-side verify endpoint as a safety net.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.ensure_user_records(
  p_user_id uuid,
  p_name    text default '',
  p_email   text default null
)
returns void as $$
begin
  -- 1. Profile (idempotent — skip if row exists)
  insert into public.profiles (id, email, name, created_at, last_seen_at)
  values (p_user_id, p_email, coalesce(p_name, ''), now(), now())
  on conflict (id) do update
    set last_seen_at = now(),
        email = coalesce(excluded.email, public.profiles.email);

  -- 2. Default free subscription (only if none exists yet)
  insert into public.subscriptions (user_id, tier, status, started_at)
  select p_user_id, 'free', 'active', now()
  where not exists (
    select 1 from public.subscriptions where user_id = p_user_id
  );

  -- 3. Log first usage event (only if user has zero events)
  insert into public.usage_events (user_id, event_type, value_text)
  select p_user_id, 'account_created', 'signup'
  where not exists (
    select 1 from public.usage_events
    where user_id = p_user_id and event_type = 'account_created'
  );
end;
$$ language plpgsql security definer;

-- ═══════════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- When a user signs up via magic link, auto-create their profile
-- plus all dependent records via ensure_user_records().
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  perform public.ensure_user_records(
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════
-- BACK-FILL existing auth.users who are missing a profile
-- (safe to run repeatedly — ensure_user_records is idempotent)
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select au.id, au.email, au.raw_user_meta_data->>'name' as name
    from auth.users au
    left join public.profiles p on p.id = au.id
    where p.id is null
  loop
    perform public.ensure_user_records(r.id, coalesce(r.name, ''), r.email);
  end loop;
end;
$$;
