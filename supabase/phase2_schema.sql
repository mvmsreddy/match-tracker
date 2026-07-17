-- ============================================================
-- PHASE 2 — Tournament Weeks + Events
-- Replaces the old single-level "tournaments" table with a
-- proper two-level architecture: tournament_weeks → events
--
-- Run in Supabase SQL Editor AFTER phase1b_role_confirmed.sql
-- ============================================================

-- Drop old single-level tournament tables (no real data yet)
drop table if exists public.tournament_matches cascade;
drop table if exists public.draw_entries cascade;
drop table if exists public.tournaments cascade;

-- ----------------------------------------------------------
-- 1. tournament_weeks  (the umbrella — one per event week)
-- ----------------------------------------------------------
create table if not exists public.tournament_weeks (
  id                    uuid primary key default gen_random_uuid(),
  created_by            uuid not null references auth.users(id) on delete cascade,
  created_at            timestamptz not null default now(),

  -- Identity
  name                  text not null,
  subtitle              text,
  tournament_code       text,

  -- Location
  location              text,
  city                  text,
  state_abbr            text,
  surface               text,

  -- Dates
  start_date            date,
  end_date              date,

  -- Officials
  referee               text,

  -- Court configuration (shared across all events this week)
  num_courts            integer not null default 1,
  court_names           text[] not null default array['Court 1'],
  day_start_time        time not null default '09:00:00',

  -- OOP engine constants (from requirements)
  match_duration_mins   integer not null default 90,
  rest_mins_between     integer not null default 30,

  -- Participation rules (per requirements)
  max_singles_per_player  integer not null default 2,
  max_doubles_per_player  integer not null default 1,
  playing_up_allowed      boolean not null default true,
  playing_down_allowed    boolean not null default false
);

alter table public.tournament_weeks enable row level security;

create policy "Anyone authenticated can view tournament weeks"
  on public.tournament_weeks for select
  to authenticated using (true);

create policy "Organizer can create tournament weeks"
  on public.tournament_weeks for insert
  with check (auth.uid() = created_by);

create policy "Organizer can update their own weeks"
  on public.tournament_weeks for update
  using (auth.uid() = created_by);

create policy "Organizer can delete their own weeks"
  on public.tournament_weeks for delete
  using (auth.uid() = created_by);

create index if not exists tournament_weeks_created_by_idx
  on public.tournament_weeks (created_by, start_date desc);

create index if not exists tournament_weeks_start_date_idx
  on public.tournament_weeks (start_date desc);

-- ----------------------------------------------------------
-- 2. events  (one row per category+age_group within a week)
-- ----------------------------------------------------------
create table if not exists public.events (
  id                  uuid primary key default gen_random_uuid(),
  tournament_week_id  uuid not null references public.tournament_weeks(id) on delete cascade,
  created_at          timestamptz not null default now(),

  -- What kind of event
  category            text not null,  -- 'Boys Singles' | 'Girls Singles' | 'Boys Doubles' | 'Girls Doubles' | 'Mixed Doubles'
  age_group           text not null,  -- 'U10' | 'U12' | 'U14' | 'U16' | 'U18' | 'Open'
  is_doubles          boolean not null default false,

  -- Draw configuration
  draw_size           integer not null default 32,   -- 4 | 8 | 16 | 32 | 64 | 128
  num_seeds           integer not null default 4,    -- 2 | 4 | 8 | 16
  has_qualifying      boolean not null default false,
  qualifying_size     integer,                        -- 16 | 32 | 64
  qualifying_spots    integer,                        -- how many qualify to main draw

  -- Lifecycle
  status              text not null default 'setup', -- 'setup' | 'draw_ready' | 'in_progress' | 'complete'

  unique (tournament_week_id, category, age_group)
);

alter table public.events enable row level security;

create policy "Anyone authenticated can view events"
  on public.events for select
  to authenticated using (true);

create policy "Week creator can manage events"
  on public.events for insert
  with check (
    auth.uid() = (select created_by from public.tournament_weeks where id = tournament_week_id)
  );

create policy "Week creator can update events"
  on public.events for update
  using (
    auth.uid() = (select created_by from public.tournament_weeks where id = tournament_week_id)
  );

create policy "Week creator can delete events"
  on public.events for delete
  using (
    auth.uid() = (select created_by from public.tournament_weeks where id = tournament_week_id)
  );

create index if not exists events_week_idx
  on public.events (tournament_week_id);

-- ----------------------------------------------------------
-- 3. draw_entries  (players / teams per event draw position)
--    Rebuilt from scratch with event_id + partner support
-- ----------------------------------------------------------
create table if not exists public.draw_entries (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  draw_type             text not null,       -- 'qualifying' | 'main'
  position              integer not null,    -- 1-based draw position
  seed                  integer,
  is_bye                boolean not null default false,
  qualifier_slot        integer,             -- for main draw Q slots

  -- Player 1 (or the singles player)
  player_id             uuid references public.user_profiles(id) on delete set null,
  family_name           text not null,
  first_name            text,
  aita_reg              text,               -- cross-event identity key
  player_state          text,
  ranking               integer,
  date_of_birth         date,
  status_code           text,               -- 'WC' | 'LL' | 'Q' | 'PR' | 'ITF'

  -- Partner (doubles only)
  partner_id            uuid references public.user_profiles(id) on delete set null,
  partner_family_name   text,
  partner_first_name    text,
  partner_aita_reg      text,
  partner_state         text,
  partner_ranking       integer,

  -- Alternate tracking
  is_alternate          boolean not null default false,
  replacing_name        text,

  unique (event_id, draw_type, position)
);

alter table public.draw_entries enable row level security;

create policy "Anyone authenticated can view draw entries"
  on public.draw_entries for select
  to authenticated using (true);

create policy "Event week creator can insert draw entries"
  on public.draw_entries for insert
  with check (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Event week creator can update draw entries"
  on public.draw_entries for update
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Event week creator can delete draw entries"
  on public.draw_entries for delete
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create index if not exists draw_entries_event_idx
  on public.draw_entries (event_id, draw_type, position);

create index if not exists draw_entries_aita_reg_idx
  on public.draw_entries (aita_reg)
  where aita_reg is not null;

-- ----------------------------------------------------------
-- 4. event_matches  (one row per match slot in the bracket)
-- ----------------------------------------------------------
create table if not exists public.event_matches (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  draw_type        text not null,        -- 'qualifying' | 'main'
  round            integer not null,     -- 1 = first round
  match_slot       integer not null,     -- slot within the round (1-based)

  entry1_id        uuid references public.draw_entries(id) on delete set null,
  entry2_id        uuid references public.draw_entries(id) on delete set null,
  winner_entry_id  uuid references public.draw_entries(id) on delete set null,

  score            text,                 -- e.g. "6-3, 6-4"
  outcome_type     text,                 -- 'score' | 'walkover' | 'retirement' | 'default'
  umpire           text,
  status           text not null default 'pending',  -- 'pending' | 'live' | 'complete'
  day_number       integer,

  unique (event_id, draw_type, round, match_slot)
);

alter table public.event_matches enable row level security;

create policy "Anyone authenticated can view event matches"
  on public.event_matches for select
  to authenticated using (true);

create policy "Event week creator can insert matches"
  on public.event_matches for insert
  with check (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Event week creator can update matches"
  on public.event_matches for update
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Event week creator can delete matches"
  on public.event_matches for delete
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create index if not exists event_matches_event_idx
  on public.event_matches (event_id, draw_type, round, match_slot);
