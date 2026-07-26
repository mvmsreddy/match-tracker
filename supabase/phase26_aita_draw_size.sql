-- ============================================================
-- PHASE 26 — AITA draw size
-- Adds a `draw_size` column to aita_tournaments, populated by the updated
-- sync-aita-calendar Edge Function from the "DRAWS & SIGN IN DETAILS" table
-- in each tournament's fact sheet PDF, e.g.
--   "Qualifying 48B/32G · Main 64B/48G · Doubles 16"
--
-- Run in Supabase SQL Editor. Then redeploy the Edge Function so future
-- syncs populate it:
--   supabase functions deploy sync-aita-calendar
-- Existing rows won't be backfilled until their fact sheet is re-parsed —
-- trigger that per-tournament with ?forceReparse=<aitaId>, or for everyone
-- at once with ?resetAll=true (see index.ts comments for both).
-- ============================================================

alter table public.aita_tournaments add column if not exists draw_size text;
