-- ============================================================
-- PHASE 57 — Unified daily AITA sync schedule (midnight IST)
-- Reschedules calendar + rankings crons to run once daily at
-- 18:30 UTC (= 00:00 IST). Replace placeholders before running.
--
-- Requires phase25 + phase28 already applied and edge functions deployed.
-- ============================================================

-- Remove old schedules if they exist
select cron.unschedule(jobid)
from cron.job
where jobname in ('sync-aita-calendar', 'sync-aita-rankings', 'sync-aita-calendar-daily', 'sync-aita-rankings-daily');

-- Calendar sync — daily at midnight IST (18:30 UTC)
select cron.schedule(
  'sync-aita-calendar-daily',
  '30 18 * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/sync-aita-calendar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Rankings sync — 30 min after calendar (00:30 IST)
select cron.schedule(
  'sync-aita-rankings-daily',
  '0 19 * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_PROJECT_URL>/functions/v1/sync-aita-rankings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
