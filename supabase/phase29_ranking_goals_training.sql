-- ============================================================
-- PHASE 29 — Multi-Segment Dashboard: Ranking Goals + Training Sessions
-- See C:\Users\madhu\.claude\plans\dreamy-wandering-lerdorf.md (Phase 3) for
-- the full design rationale. Both tables are segment-scoped (category +
-- subcategory, matching aita_rankings/governingBodies.js's taxonomy) and
-- fully independent per segment — no cascading/roll-up logic here or anywhere
-- else in this feature; see the plan doc's Context section for why.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ----------------------------------------------------------
-- 1. ranking_goals — a player's target rank/points for one segment
-- ----------------------------------------------------------
create table if not exists public.ranking_goals (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references auth.users(id) on delete cascade,
  category          text not null,        -- 'Boys'|'Girls'|'Men'|'Women' — matches aita_rankings
  subcategory       text not null,        -- 'U-12'|'U-14'|...|'Singles'|'Doubles'
  circuit_key       text not null,        -- circuitKey(category, subcategory) — indexed for lookup
  target_rank       integer,
  target_points     numeric,
  target_date       date,
  status            text not null default 'active',  -- 'active' | 'achieved' | 'abandoned'
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.ranking_goals enable row level security;

create policy "Players manage their own ranking goals"
  on public.ranking_goals for all
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

-- A linked, active coach can view (not edit) their player's goals — same
-- cross-user access pattern coach_player_links already establishes.
create policy "Linked coaches can view a player's ranking goals"
  on public.ranking_goals for select
  using (
    exists (
      select 1 from public.coach_player_links l
      where l.player_id = ranking_goals.player_id
        and l.coach_id = auth.uid()
        and l.status = 'active'
    )
  );

create index if not exists ranking_goals_player_circuit_idx
  on public.ranking_goals (player_id, circuit_key);

-- ----------------------------------------------------------
-- 2. training_sessions — a logged practice/drill session, segment-scoped
-- ----------------------------------------------------------
create table if not exists public.training_sessions (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references auth.users(id) on delete cascade,
  logged_by         uuid not null references auth.users(id) on delete cascade,  -- player themself, or a linked coach
  category          text not null,
  subcategory       text not null,
  circuit_key       text not null,
  session_date      date not null,
  duration_minutes  integer,
  focus_areas       jsonb,          -- e.g. ["forehand","serve"] — free-form, no fixed taxonomy yet
  drill_ids         uuid[],         -- nullable; populated once drill_library exists (Phase 6)
  intensity         text,           -- 'light' | 'moderate' | 'high' — free text, not enforced
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.training_sessions enable row level security;

create policy "Players and loggers can view training sessions"
  on public.training_sessions for select
  using (auth.uid() = player_id or auth.uid() = logged_by);

-- Insert allowed for the player logging their own session, or a linked
-- active coach logging on their player's behalf.
create policy "Players or linked coaches can log training sessions"
  on public.training_sessions for insert
  with check (
    auth.uid() = logged_by
    and (
      auth.uid() = player_id
      or exists (
        select 1 from public.coach_player_links l
        where l.player_id = training_sessions.player_id
          and l.coach_id = auth.uid()
          and l.status = 'active'
      )
    )
  );

create policy "Loggers can update or delete their own logged sessions"
  on public.training_sessions for update
  using (auth.uid() = logged_by)
  with check (auth.uid() = logged_by);

create policy "Loggers can delete their own logged sessions"
  on public.training_sessions for delete
  using (auth.uid() = logged_by);

create index if not exists training_sessions_player_circuit_idx
  on public.training_sessions (player_id, circuit_key, session_date desc);
