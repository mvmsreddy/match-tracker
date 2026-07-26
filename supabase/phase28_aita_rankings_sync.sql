-- ============================================================
-- PHASE 28 — AITA Rankings Incremental Sync
-- Adds the tracking tables `sync-aita-rankings` (Edge Function) needs to
-- keep public.aita_rankings current without re-scanning the whole table on
-- every run. See AITA_RANKINGS_PLAN.md Phase 6 for the full design rationale.
--
-- Run in Supabase SQL Editor. Then:
--   1. supabase functions deploy sync-aita-rankings
--      (no new secret needed — `supabase secrets set` is project-wide, so
--      the SYNC_SECRET already configured for sync-aita-calendar just works)
--   2. Replace <SUPABASE_PROJECT_URL>, <SYNC_SECRET> and
--      <SUPABASE_SERVICE_ROLE_KEY> below with real values, then run just
--      the cron.schedule block (cron.schedule upserts by job name, so
--      re-running this whole file is also safe).
-- ============================================================

-- ----------------------------------------------------------
-- 1. aita_rankings_sync_state — one row per (category, subcategory) combo,
-- tracking the newest ranking_date already synced (the "high-water mark").
-- Without this, every run would have to page through the *entire* combo's
-- rows to figure out what's new — fine for a one-off local backfill, not
-- for an Edge Function's execution budget once a combo has 100k+ rows
-- (confirmed during Phase 2: Boys U-16 alone is ~387k rows).
-- ----------------------------------------------------------
create table if not exists public.aita_rankings_sync_state (
  category          text not null,
  subcategory       text not null,
  last_synced_date  date,          -- newest ranking_date confirmed fully synced
  last_checked_at   timestamptz,   -- last time this combo's live date list was checked, success or not
  last_error        text,
  updated_at        timestamptz not null default now(),
  primary key (category, subcategory)
);

alter table public.aita_rankings_sync_state enable row level security;

create policy "Authenticated users can view AITA rankings sync state"
  on public.aita_rankings_sync_state for select
  to authenticated
  using (true);

-- No insert/update/delete policies: only the service-role key (the Edge
-- Function) writes here, and it bypasses RLS.

-- Seed the high-water mark for every combo already backfilled, so the first
-- sync run starts from "what's already here" instead of nothing.
insert into public.aita_rankings_sync_state (category, subcategory, last_synced_date, last_checked_at)
select category, subcategory, max(ranking_date), now()
from public.aita_rankings
group by category, subcategory
on conflict (category, subcategory) do update
  set last_synced_date = excluded.last_synced_date
  where public.aita_rankings_sync_state.last_synced_date is null
     or excluded.last_synced_date > public.aita_rankings_sync_state.last_synced_date;

-- ----------------------------------------------------------
-- 2. aita_rankings_skip_dates — known bad date values on AITA's own site
-- that must never be treated as "new" by the sync, or they'd be re-inserted
-- as duplicates on every single run forever. Confirmed live 2026-07-26:
-- AITA's ranking2.php date list for Girls/U-14 lists the 13-May-2024 ranking
-- PDF twice — once correctly ("2024-05-13") and once with a typo
-- ("20214-05-13", i.e. "2024" with an extra "1" inserted). The PDF itself
-- prints "As on 13th May, 2024", confirming which one is real.
-- ----------------------------------------------------------
create table if not exists public.aita_rankings_skip_dates (
  category      text not null,
  subcategory   text not null,
  bad_date      date not null,
  reason        text,
  created_at    timestamptz not null default now(),
  primary key (category, subcategory, bad_date)
);

alter table public.aita_rankings_skip_dates enable row level security;

create policy "Authenticated users can view AITA rankings skip list"
  on public.aita_rankings_skip_dates for select
  to authenticated
  using (true);

insert into public.aita_rankings_skip_dates (category, subcategory, bad_date, reason) values
  ('Girls', 'U-14', '20214-05-13', 'Duplicate of 2024-05-13 — AITA''s own date list lists the same ranking PDF under two date values (typo: "2024" -> "20214"). Confirmed via "As on 13th May, 2024" text printed inside the PDF. Cleaned up 2026-07-26; re-appears in listDatesFor() on every check since it is still genuinely on the live site.')
on conflict (category, subcategory, bad_date) do nothing;

-- ----------------------------------------------------------
-- 3. Scheduled sync — weekly via pg_cron + pg_net (AITA publishes rankings
-- weekly, so anything more frequent than this is pure wasted polling —
-- contrast with sync-aita-calendar's 6-hourly schedule, which matches how
-- often tournament listings/fact sheets actually change).
-- ----------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-aita-rankings',
  '0 6 * * 2', -- Tuesdays 06:00 UTC — a day after AITA's typical weekly publish
  $$
  select net.http_post(
    url     := '<SUPABASE_PROJECT_URL>/functions/v1/sync-aita-rankings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
