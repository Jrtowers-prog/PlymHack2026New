-- ══════════════════════════════════════════════════════════════════════
-- SafeNight — User Data Service Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Profiles ─────────────────────────────────────────────────────
-- Stores name, platform, app version, last seen.
-- Linked 1:1 with auth.users via id.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null default '',
  platform      text not null default 'unknown',  -- android, ios, web
  app_version   text not null default '0.0.0',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- ─── 2. Usage Events ────────────────────────────────────────────────
-- Flexible event log — one row per event, tiny per row.
-- event_type: app_open, route_search, navigation_start,
--             navigation_complete, navigation_abandon
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null,
  value_num   real,               -- distance_km, safety_score, etc.
  value_text  text,               -- extra context (duration, version)
  created_at  timestamptz not null default now()
);

-- ─── 3. Safety Reports ──────────────────────────────────────────────
-- User-reported hazards with pinned location.
-- Categories: poor_lighting, unsafe_area, obstruction, harassment, other
create table if not exists public.safety_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  lat         real not null,
  lng         real not null,
  category    text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ─── 4. Reviews ─────────────────────────────────────────────────────
-- App reviews with 1-5 rating.
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating >= 1 and rating <= 5),
  comment     text not null default '',
  created_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES — fast queries on common access patterns
-- ═══════════════════════════════════════════════════════════════════

create index if not exists idx_usage_user      on public.usage_events(user_id);
create index if not exists idx_usage_type      on public.usage_events(event_type);
create index if not exists idx_usage_created   on public.usage_events(created_at);
create index if not exists idx_reports_loc     on public.safety_reports(lat, lng);
create index if not exists idx_reports_cat     on public.safety_reports(category);
create index if not exists idx_reports_created on public.safety_reports(created_at);
create index if not exists idx_reviews_user    on public.reviews(user_id);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — users can only access their own data
-- Service role key bypasses RLS for server-side operations.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.usage_events enable row level security;
alter table public.safety_reports enable row level security;
alter table public.reviews enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

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

-- Reviews: users can insert their own, read all
create policy "Users can insert reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Anyone can view reviews"
  on public.reviews for select
  using (true);

-- ═══════════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- When a user signs up via magic link, auto-create their profile.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, created_at, last_seen_at)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), now(), now());
  return new;
end;
$$ language plpgsql security definer;

-- Drop if exists to avoid duplicate trigger errors on re-run
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
