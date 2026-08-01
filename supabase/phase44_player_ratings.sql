-- ============================================================
-- PHASE 44 — Computed skill rating (Glicko-2), singles only
--
-- Rates every singles player from COMPLETED official tournament bracket
-- matches (event_matches), never from self-tracked practice sessions —
-- practice opponents are free text in the `matches` table with no
-- reciprocal confirmation, so they're trivially gameable as a rating input
-- (see plan doc Phase B scope notes). This is deliberately additive: it
-- never reads or writes anything in the existing AITA-ranking or self-rated
-- skill-slider tables.
--
-- Identity: rated by subject_key — draw_entries.player_id when the entrant
-- has a platform account, else draw_entries.aita_reg (most junior opponents
-- don't have accounts; aita_reg is already the documented cross-event
-- identity key, see phase2_schema.sql).
--
-- Rating periods = tournament weeks (Glicko-2 is a batch algorithm, not a
-- real-time one — see supabase/functions/compute-ratings for the sweep
-- logic that finds weeks ready to fold in).
--
-- Run in Supabase SQL Editor AFTER phase2_schema.sql. Then:
--   1. supabase functions deploy compute-ratings
--      (reuses the SYNC_SECRET already configured for sync-aita-calendar /
--      sync-aita-rankings — no new secret needed)
--   2. Replace the placeholders in the cron.schedule block below and run it.
-- ============================================================

create table if not exists public.player_ratings (
  id             uuid primary key default gen_random_uuid(),
  subject_key    text not null,        -- draw_entries.player_id (as text) or aita_reg
  subject_type   text not null check (subject_type in ('platform', 'aita_reg')),
  player_id      uuid references public.user_profiles(id) on delete set null,
  format         text not null default 'singles',
  rating         numeric not null default 1500,
  rd             numeric not null default 350,
  volatility     numeric not null default 0.06,
  matches_count  integer not null default 0,
  last_updated   timestamptz not null default now(),
  unique (subject_key, format)
);

alter table public.player_ratings enable row level security;

create policy "Anyone authenticated can view player ratings"
  on public.player_ratings for select
  to authenticated
  using (true);

-- No insert/update/delete policies: only the service-role key
-- (compute-ratings Edge Function) ever writes here.

create index if not exists player_ratings_player_idx
  on public.player_ratings (player_id) where player_id is not null;

-- ----------------------------------------------------------
-- Append-only snapshot per recompute — powers the trend sparkline on
-- PlayerRatingCard, same shape as the aita_rankings history pattern.
-- ----------------------------------------------------------
create table if not exists public.rating_history (
  id                  uuid primary key default gen_random_uuid(),
  subject_key         text not null,
  format              text not null default 'singles',
  tournament_week_id  uuid references public.tournament_weeks(id) on delete set null,
  rating              numeric not null,
  rd                  numeric not null,
  volatility          numeric not null,
  matches_count       integer not null,
  created_at          timestamptz not null default now()
);

alter table public.rating_history enable row level security;

create policy "Anyone authenticated can view rating history"
  on public.rating_history for select
  to authenticated
  using (true);

create index if not exists rating_history_subject_idx
  on public.rating_history (subject_key, format, created_at);

-- ----------------------------------------------------------
-- Marks which tournament weeks have already been folded into ratings, so
-- the Edge Function only ever sweeps weeks it hasn't processed yet instead
-- of re-scanning full history every run.
-- ----------------------------------------------------------
alter table public.tournament_weeks
  add column if not exists rating_computed_at timestamptz;

create index if not exists tournament_weeks_rating_pending_idx
  on public.tournament_weeks (end_date)
  where rating_computed_at is null;

-- ----------------------------------------------------------
-- Lightweight run log for observability (mirrors aita_sync_log).
-- ----------------------------------------------------------
create table if not exists public.rating_compute_log (
  id                  uuid primary key default gen_random_uuid(),
  tournament_week_id  uuid references public.tournament_weeks(id) on delete set null,
  started_at          timestamptz not null,
  finished_at         timestamptz,
  subjects_updated    integer default 0,
  matches_processed   integer default 0,
  error               text,
  triggered_by        text,
  created_at          timestamptz not null default now()
);

alter table public.rating_compute_log enable row level security;

create policy "Anyone authenticated can view rating compute log"
  on public.rating_compute_log for select
  to authenticated
  using (true);

-- ----------------------------------------------------------
-- Scheduled compute — daily (tournament weeks end on varying days, unlike
-- AITA's fixed weekly publish cadence, so this checks more often; the
-- Edge Function itself is cheap to no-op when nothing is pending).
-- ----------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'compute-ratings',
  '30 3 * * *', -- 03:30 UTC daily
  $$
  select net.http_post(
    url     := '<SUPABASE_PROJECT_URL>/functions/v1/compute-ratings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
