-- ============================================================
-- PHASE 41 — Reminder + Weekly Digest Preferences
-- See docs/ace-tracker-feature-gap-prd.md §2.5 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 4, item 9).
--
-- Preference columns read by the two new Edge Functions
-- (send-reminder-emails, send-weekly-digest) and their pg_cron schedules,
-- set up exactly like phase25_aita_calendar.sql /
-- phase28_aita_rankings_sync.sql's cron blocks.
--
-- IMPORTANT: replace <SUPABASE_PROJECT_URL>, <SUPABASE_SERVICE_ROLE_KEY>,
-- and <SYNC_SECRET> below with your real values before running the
-- cron.schedule() calls (same placeholders those two files use — reuse the
-- same SYNC_SECRET already configured, no new secret needed there).
--
-- Run in Supabase SQL Editor.
-- ============================================================

alter table public.user_profiles
  add column if not exists reminder_enabled     boolean not null default false,
  add column if not exists reminder_time         time not null default '18:00',
  add column if not exists reminder_timezone      text not null default 'Asia/Kolkata',
  add column if not exists last_reminded_date     date,
  add column if not exists weekly_digest          boolean not null default false;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 min: send-reminder-emails decides per-user whether it's actually
-- "their" reminder time (see that function's header) — the cron cadence
-- itself is just a tick, not a per-user schedule.
select cron.schedule(
  'send-reminder-emails',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/send-reminder-emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Monday 08:00 UTC tick — send-weekly-digest itself narrows to each coach's
-- local Monday-morning window (same pattern as ACE Tracker's
-- _weekly_digest_tick, ported from insights.py).
select cron.schedule(
  'send-weekly-digest',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/send-weekly-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
