-- ============================================================
-- PHASE 38 — Realtime Notifications
-- See docs/ace-tracker-feature-gap-prd.md §2.3 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 3, item 6).
--
-- Enables Postgres change-data-capture broadcast for the notifications
-- table so src/hooks/useNotifications.js can subscribe instead of relying
-- solely on its 60s poll. Idempotent — Postgres errors if you add a table
-- to a publication it's already in, hence the guard.
--
-- Run in Supabase SQL Editor.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
