-- Phase 22: Freeze Deadline
-- Run this in Supabase SQL Editor AFTER phase12_factsheet_fields.sql
--
-- Verified against the source PDF (Rules_Collated_AITA_Junior_Circuit_
-- Tournaments_2026.pdf): withdrawals go through three stages —
--   1. Till Withdrawal Deadline           — on-time, via AITA login
--   2. After Withdrawal Deadline till the
--      Freeze Deadline (1700 Hrs Thursday) — late withdrawal, still via AITA login
--   3. After the Freeze Deadline           — only via email to the tournament
--      referee (offline/manual, self-service is closed)
--
-- entry_deadline and withdrawal_deadline already exist (phase12) but store
-- only a date — freeze_deadline needs a time-of-day too (1700 Hrs), hence
-- timestamptz rather than date.

alter table public.tournament_weeks
  add column if not exists freeze_deadline timestamptz;
