-- ============================================================
-- PHASE 27 — AITA Player Rankings
-- Mirrors ranking PDFs from https://aitatennis.com/playerranking/ into a
-- structured table. See AITA_RANKINGS_PLAN.md at the repo root for the
-- full reverse-engineered site mechanics, category/subcategory catalog,
-- and the phased rollout this is Phase 1 of (Girls U-12 only, to start).
--
-- Unlike aita_tournaments (kept fresh by a deployed Edge Function on a
-- cron), this table is currently populated by a one-off local backfill
-- script run against the service-role key — see
-- scripts/aita-rankings/backfill.mjs at the repo root. An incremental-sync
-- Edge Function is Phase 6 of the plan, once enough categories are
-- backfilled to be worth keeping current.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.aita_rankings (
  id                  uuid primary key default gen_random_uuid(),

  category            text not null,        -- 'Boys','Girls','Men','Women','Seniors','Seniorwomen','Wheelchair'
  subcategory         text not null,        -- 'U-12','Singles','35+ Doubles','Wheelchair-Mens-Singles', etc.
  ranking_date        date not null,        -- the "as on" date (= date1 query param on aitatennis.com)

  -- AITA's ranking tables give tied players the SAME rank number (standard
  -- competition-ranking convention — confirmed live: 9 different players
  -- all printed as rank 739 in one sample PDF, each with their own reg_no
  -- and matching point totals). So `rank` is NOT unique per snapshot —
  -- row_order is the true 1-based position in the PDF and is what the
  -- unique constraint is built on; `rank` stays as the real printed value.
  row_order           integer not null,
  rank                integer not null,
  player_name         text not null,
  reg_no              text,                 -- nullable — blank for some Seniors-era PDFs
  dob                 date,                 -- nullable — Seniors/Wheelchair PDFs have no DOB column
  state               text,
  total_points        numeric,
  points_breakdown    jsonb,                -- category-specific point columns — layout varies by category
                                             -- type (see AITA_RANKINGS_PLAN.md section 4), so this is kept
                                             -- flexible rather than forcing every variant into named columns

  pdf_url             text not null,
  source_url          text,                 -- the aitatennis.com/rankingresult/?... page it was read from

  synced_at           timestamptz not null default now(),

  unique (category, subcategory, ranking_date, row_order)
);

alter table public.aita_rankings enable row level security;

create policy "Authenticated users can view AITA rankings"
  on public.aita_rankings for select
  to authenticated
  using (true);

-- No insert/update/delete policies: only the service-role key (backfill
-- script, later the sync Edge Function) may write, and it bypasses RLS.

create index if not exists aita_rankings_lookup_idx
  on public.aita_rankings (category, subcategory, ranking_date);

create index if not exists aita_rankings_reg_no_idx
  on public.aita_rankings (reg_no);

create index if not exists aita_rankings_player_name_idx
  on public.aita_rankings (player_name);

-- ----------------------------------------------------------
-- Backfill/sync run history — same shape as aita_sync_log, one row per
-- (category, subcategory) backfill pass so a long multi-phase backfill
-- can be resumed/audited across sessions.
-- ----------------------------------------------------------
create table if not exists public.aita_rankings_sync_log (
  id                   uuid primary key default gen_random_uuid(),
  category             text not null,
  subcategory          text not null,
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  dates_found          integer,
  dates_upserted       integer,
  rows_upserted        integer,
  error                text,
  triggered_by         text    -- 'backfill:<script>' | 'cron' | 'manual:<user_id>'
);

alter table public.aita_rankings_sync_log enable row level security;

create policy "Authenticated users can view AITA rankings sync log"
  on public.aita_rankings_sync_log for select
  to authenticated
  using (true);

create index if not exists aita_rankings_sync_log_started_at_idx
  on public.aita_rankings_sync_log (started_at desc);
