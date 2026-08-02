-- ============================================================
-- PHASE 49 — Category/age-group selection on "I'm Playing" declarations
-- Extends phase45_aita_crowdsourced.sql.
--
-- aita_tournaments.age_group/category are captured from a single AITA
-- calendar cell / detail-page line at sync time (sync-aita-calendar's
-- parseCalendarHtml keeps only the FIRST age-group column it finds for a
-- given aitaId — a tournament that actually spans several age groups under
-- one listing only ever gets one of them recorded). So "I'm Playing" can't
-- always trust the tournament row's own category/age_group as the player's
-- real entry — when it's not a clean, unambiguous Singles/Doubles category,
-- the player is asked to pick explicitly instead of us guessing.
--
-- Run in Supabase SQL Editor.
-- ============================================================

alter table public.aita_participation_interest
  add column if not exists selected_category  text,
  add column if not exists selected_age_group text;
