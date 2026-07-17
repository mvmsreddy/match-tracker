-- ============================================================
-- PHASE 1 — User Profiles & Coach-Player Links
-- Run this in Supabase SQL Editor AFTER the base schema.sql
-- ============================================================

-- ----------------------------------------------------------
-- 1. user_profiles
--    Extends auth.users with role + sport-specific fields.
--    One row per user, id = auth.users.id
-- ----------------------------------------------------------
create table if not exists public.user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  role            text not null default 'player',  -- 'player' | 'coach' | 'organizer'
  display_name    text,

  -- Player-specific
  aita_reg        text,
  state_abbr      text,
  date_of_birth   date,
  ranking         integer,

  -- Shared / Organizer / Coach
  club_name       text,
  bio             text,
  is_verified     boolean not null default false   -- organizers only; set by admin
);

alter table public.user_profiles enable row level security;

create policy "Users can view any profile"
  on public.user_profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Auto-update updated_at on every row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure update_updated_at();

-- Auto-create a profile row when a new auth user signs up.
-- Reads name and role from user_metadata (set during signup form).
-- This runs as security definer so it bypasses RLS.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create index if not exists user_profiles_role_idx
  on public.user_profiles (role);

create index if not exists user_profiles_aita_reg_idx
  on public.user_profiles (aita_reg)
  where aita_reg is not null;

-- ----------------------------------------------------------
-- 2. coach_player_links
--    Many-to-many relationship between coaches and players.
--    Coach sends request; player accepts or declines.
-- ----------------------------------------------------------
create table if not exists public.coach_player_links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  coach_id    uuid not null references public.user_profiles(id) on delete cascade,
  player_id   uuid not null references public.user_profiles(id) on delete cascade,
  status      text not null default 'pending',  -- 'pending' | 'active' | 'declined'

  unique (coach_id, player_id)
);

alter table public.coach_player_links enable row level security;

-- Coach and player both see their own links
create policy "Users can view their own links"
  on public.coach_player_links for select
  to authenticated
  using (auth.uid() = coach_id or auth.uid() = player_id);

-- Only coaches can create link requests
create policy "Coaches can create link requests"
  on public.coach_player_links for insert
  with check (auth.uid() = coach_id);

-- Either party can update (player accepts/declines; coach can cancel)
create policy "Either party can update link status"
  on public.coach_player_links for update
  using (auth.uid() = coach_id or auth.uid() = player_id);

-- Either party can delete (unlink)
create policy "Either party can delete a link"
  on public.coach_player_links for delete
  using (auth.uid() = coach_id or auth.uid() = player_id);

create trigger coach_player_links_updated_at
  before update on public.coach_player_links
  for each row execute procedure update_updated_at();

create index if not exists coach_player_links_coach_idx
  on public.coach_player_links (coach_id, status);

create index if not exists coach_player_links_player_idx
  on public.coach_player_links (player_id, status);
