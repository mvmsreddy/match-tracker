-- ============================================================
-- PHASE 25 — AITA Calendar Sync
-- Mirrors tournaments from https://aitatennis.com/management/calendar.php
-- into a read-only table, kept fresh by the `sync-aita-calendar` Edge
-- Function (cron + manual trigger). Fact sheet PDFs are re-hosted in
-- Supabase Storage since AITA's links are signed/expiring.
--
-- Run in Supabase SQL Editor. Then:
--   1. supabase functions deploy sync-aita-calendar
--   2. supabase secrets set SYNC_SECRET=<a random value>
--   3. Replace <SUPABASE_PROJECT_URL>, <SYNC_SECRET> and
--      <SUPABASE_SERVICE_ROLE_KEY> below with real values, then run just
--      the cron.schedule block (or re-run the whole file — cron.schedule
--      upserts by job name).
--
--      Edge Functions verify a Supabase-signed JWT at the platform gateway
--      before your function code ever runs. pg_cron's request carries no
--      user session, so the Authorization header below must be the
--      service-role key (itself a valid project JWT) purely to clear that
--      gateway check — x-sync-secret is what the function code actually
--      checks to distinguish "this is the trusted cron job". This is
--      Supabase's documented pattern for calling an Edge Function from
--      pg_cron; the service-role key is only ever visible to roles that
--      can already read pg_cron.job (i.e. the database owner).
-- ============================================================

-- ----------------------------------------------------------
-- 1. aita_tournaments — mirrored calendar + fact sheet data
-- ----------------------------------------------------------
create table if not exists public.aita_tournaments (
  id                      uuid primary key default gen_random_uuid(),
  aita_id                 integer not null unique,   -- AITA's ?id= param, the upsert key

  name                    text,
  grade                   text,     -- best-effort from name prefix, e.g. "NS", "CS7", "ITF Juniors"
  age_group               text,     -- "Under 10" .. "Under 18", "Men", "Women", "Senior" (calendar column)
  category                text,     -- "Category - ..." line from the detail page (may echo age_group)

  city                    text,
  venue                   text,
  start_date              date,

  source_url              text,     -- tournament-content?id=... on aitatennis.com

  -- Fact sheet fields (same vocabulary as tournament_weeks, phase12)
  entry_deadline          date,
  withdrawal_deadline     date,
  qualifying_start_date   date,
  qualifying_end_date     date,
  director_name           text,
  director_phone          text,
  director_email          text,
  referee_name            text,
  referee_phone           text,
  referee_email           text,
  venue_address           text,
  venue_pincode           text,
  venue_phone             text,
  surface                 text,
  ball_brand              text,
  has_floodlights         boolean,
  entry_fee_singles       integer,
  entry_fee_doubles       integer,
  daily_allowance         integer,
  signin_instructions     text,

  -- Re-hosted fact sheet PDF
  factsheet_source_url    text,     -- original AITA blob SAS URL (kept for debugging)
  factsheet_filename      text,     -- e.g. "factsheet_1766744619.pdf" — cheap change-detection signal
  factsheet_storage_path  text,     -- path within the aita-factsheets bucket
  content_hash            text,     -- sha-256 of parsed fields, secondary change-detection signal

  first_seen_at           timestamptz not null default now(),
  last_seen_at            timestamptz not null default now(),
  last_changed_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.aita_tournaments enable row level security;

create policy "Authenticated users can view AITA tournaments"
  on public.aita_tournaments for select
  to authenticated
  using (true);

-- No insert/update/delete policies: only the service-role key (used by the
-- Edge Function) may write, and it bypasses RLS entirely.

create index if not exists aita_tournaments_start_date_idx
  on public.aita_tournaments (start_date);

create index if not exists aita_tournaments_age_group_idx
  on public.aita_tournaments (age_group);

-- ----------------------------------------------------------
-- 2. aita_sync_log — history of sync runs
-- ----------------------------------------------------------
create table if not exists public.aita_sync_log (
  id                   uuid primary key default gen_random_uuid(),
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  tournaments_found    integer,
  tournaments_upserted integer,
  tournaments_changed  integer,
  error                text,
  triggered_by         text    -- 'cron' | 'manual:<user_id>'
);

alter table public.aita_sync_log enable row level security;

create policy "Authenticated users can view AITA sync log"
  on public.aita_sync_log for select
  to authenticated
  using (true);

create index if not exists aita_sync_log_started_at_idx
  on public.aita_sync_log (started_at desc);

-- ----------------------------------------------------------
-- 3. Storage bucket for re-hosted fact sheet PDFs
-- ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('aita-factsheets', 'aita-factsheets', true)
on conflict (id) do nothing;

create policy "Public read AITA factsheets"
  on storage.objects for select
  using (bucket_id = 'aita-factsheets');

-- Writes go through the service-role key (Edge Function), which bypasses
-- storage RLS, so no insert/update policy is needed here either.

-- ----------------------------------------------------------
-- 4. Scheduled sync — every 6 hours via pg_cron + pg_net
-- ----------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-aita-calendar',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := '<SUPABASE_PROJECT_URL>/functions/v1/sync-aita-calendar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
