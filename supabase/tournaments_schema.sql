-- ============================================================
-- TOURNAMENTS MODULE — run this in Supabase SQL Editor
-- ============================================================
-- Three tables:
--   tournaments     — one row per event hosted
--   draw_entries    — player positions in qualifying / main draw
--   tournament_matches — match slots with scores per round
-- ============================================================

-- ----------------------------------------------------------
-- 1. tournaments
-- ----------------------------------------------------------
create table if not exists public.tournaments (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),

  name             text not null,                  -- e.g. "SMTA AITA Circuit"
  subtitle         text,                            -- e.g. "AITA Circuit"
  category         text not null,                  -- "Girls Singles", "Boys Singles", etc.
  grade            text,                            -- "National Serie", "State", etc.
  location         text,                            -- venue name
  city             text,
  state_abbr       text,
  surface          text,
  start_date       date,
  end_date         date,
  referee          text,
  tournament_code  text,
  draw_types       text[] not null default array['qualifying','main']
);

alter table public.tournaments enable row level security;

-- All authenticated users can view all tournaments
create policy "Authenticated users can view tournaments"
  on public.tournaments for select
  to authenticated
  using (true);

-- Only the creator can manage their tournaments
create policy "Creators can insert tournaments"
  on public.tournaments for insert
  with check (auth.uid() = created_by);

create policy "Creators can update tournaments"
  on public.tournaments for update
  using (auth.uid() = created_by);

create policy "Creators can delete tournaments"
  on public.tournaments for delete
  using (auth.uid() = created_by);

create index if not exists tournaments_created_at_idx
  on public.tournaments (created_at desc);

-- ----------------------------------------------------------
-- 2. draw_entries
-- ----------------------------------------------------------
create table if not exists public.draw_entries (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  draw_type      text not null,        -- 'qualifying' | 'main'
  position       integer not null,     -- 1-based draw position (1–32, 1–16, etc.)
  aita_reg       text,
  status_code    text,                 -- 'WC', 'LL', 'Q', 'PR', etc.
  rank           integer,
  seed           integer,
  family_name    text not null,
  first_name     text,
  player_state   text,
  is_alternate   boolean not null default false,
  replacing_name text,                 -- for alternates

  unique (tournament_id, draw_type, position)
);

alter table public.draw_entries enable row level security;

create policy "Authenticated users can view draw entries"
  on public.draw_entries for select
  to authenticated
  using (true);

create policy "Tournament creators can insert draw entries"
  on public.draw_entries for insert
  with check (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create policy "Tournament creators can update draw entries"
  on public.draw_entries for update
  using (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create policy "Tournament creators can delete draw entries"
  on public.draw_entries for delete
  using (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create index if not exists draw_entries_tournament_idx
  on public.draw_entries (tournament_id, draw_type, position);

-- ----------------------------------------------------------
-- 3. tournament_matches
-- ----------------------------------------------------------
create table if not exists public.tournament_matches (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments(id) on delete cascade,
  draw_type        text not null,       -- 'qualifying' | 'main'
  round            integer not null,    -- 1 = first round, 2 = second, …
  match_slot       integer not null,    -- slot within the round (1-based)
  entry1_id        uuid references public.draw_entries(id) on delete set null,
  entry2_id        uuid references public.draw_entries(id) on delete set null,
  score            text,                -- e.g. "6-3, 6-4" or "6-3, 3-6, [10-7]"
  winner_entry_id  uuid references public.draw_entries(id) on delete set null,
  umpire           text,
  status           text not null default 'pending',  -- 'pending' | 'live' | 'complete'

  unique (tournament_id, draw_type, round, match_slot)
);

alter table public.tournament_matches enable row level security;

create policy "Authenticated users can view tournament matches"
  on public.tournament_matches for select
  to authenticated
  using (true);

create policy "Tournament creators can insert matches"
  on public.tournament_matches for insert
  with check (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create policy "Tournament creators can update matches"
  on public.tournament_matches for update
  using (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create policy "Tournament creators can delete matches"
  on public.tournament_matches for delete
  using (
    auth.uid() = (select created_by from public.tournaments where id = tournament_id)
  );

create index if not exists tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, draw_type, round, match_slot);
