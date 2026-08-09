-- Phase 58 — Multi-format tournament engine
-- Run after phase57. Adds league/RR/team-tie formats alongside existing knockout.

-- ---------------------------------------------------------------------------
-- 1. Event format columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists format text not null default 'single_elimination',
  add column if not exists format_config jsonb not null default '{}'::jsonb;

comment on column public.events.format is
  'single_elimination | double_elimination | round_robin | double_round_robin | rr_playoffs | rr_page_playoff | pool_ko | pool_rr | swiss | compass | king_of_court | team_tie_rr | team_tie_rr_playoffs | consolation | season_league';

-- ---------------------------------------------------------------------------
-- 2. Teams (corporate squads, Davis Cup nations, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.event_teams (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  roster       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  unique (event_id, name)
);

create index if not exists event_teams_event_idx on public.event_teams (event_id, sort_order);

alter table public.event_teams enable row level security;

create policy "Organizer manages event teams"
  on public.event_teams for all
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Anyone can read event teams"
  on public.event_teams for select using (true);

-- ---------------------------------------------------------------------------
-- 3. Stages (RR, pools, playoffs, losers bracket, swiss rounds, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.event_stages (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  stage_key    text not null,
  stage_type   text not null,
  stage_order  integer not null default 0,
  label        text,
  config       jsonb not null default '{}'::jsonb,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (event_id, stage_key)
);

create index if not exists event_stages_event_idx on public.event_stages (event_id, stage_order);

alter table public.event_stages enable row level security;

create policy "Organizer manages event stages"
  on public.event_stages for all
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Anyone can read event stages"
  on public.event_stages for select using (true);

-- ---------------------------------------------------------------------------
-- 4. Extend event_matches for league / team formats
-- ---------------------------------------------------------------------------
alter table public.event_matches
  add column if not exists stage_id uuid references public.event_stages(id) on delete set null,
  add column if not exists group_id text,
  add column if not exists team1_id uuid references public.event_teams(id) on delete set null,
  add column if not exists team2_id uuid references public.event_teams(id) on delete set null,
  add column if not exists tie_score text,
  add column if not exists courts integer[] default '{}',
  add column if not exists scheduled_start timestamptz,
  add column if not exists label text;

-- ---------------------------------------------------------------------------
-- 5. Standings (RR, Swiss, pools)
-- ---------------------------------------------------------------------------
create table if not exists public.event_standings (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  stage_id       uuid not null references public.event_stages(id) on delete cascade,
  team_id        uuid references public.event_teams(id) on delete cascade,
  entry_id       uuid references public.draw_entries(id) on delete cascade,
  wins           integer not null default 0,
  losses         integer not null default 0,
  draws          integer not null default 0,
  ties_won       integer not null default 0,
  ties_lost      integer not null default 0,
  sets_won       integer not null default 0,
  sets_lost      integer not null default 0,
  games_won      integer not null default 0,
  games_lost     integer not null default 0,
  points         integer not null default 0,
  rank           integer,
  tiebreak_data  jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  constraint event_standings_participant_chk check (team_id is not null or entry_id is not null)
);

create unique index if not exists event_standings_team_uq
  on public.event_standings (stage_id, team_id) where team_id is not null;

create unique index if not exists event_standings_entry_uq
  on public.event_standings (stage_id, entry_id) where entry_id is not null;

create index if not exists event_standings_stage_idx on public.event_standings (stage_id, rank);

alter table public.event_standings enable row level security;

create policy "Organizer manages standings"
  on public.event_standings for all
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create policy "Anyone can read standings"
  on public.event_standings for select using (true);
