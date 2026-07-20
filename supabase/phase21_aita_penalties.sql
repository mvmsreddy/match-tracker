-- Phase 21: AITA no-show / late-withdrawal penalty points
-- Run this in Supabase SQL Editor AFTER phase18_withdrawal_audit.sql
--
-- Verified against the source PDF (Rules_Collated_AITA_Junior_Circuit_
-- Tournaments_2026.pdf): No-Show deducts ranking points per grade
-- (TS7 -5, CS7 -5, SS -5, NS -10, Nationals -15); a 3rd+ Late Withdrawal
-- in a calendar year deducts -15, but only for SS/NS/Nationals. The actual
-- point values are computed client-side (src/utils/aitaGradeRules.js) at
-- the moment a withdrawal is logged and stored here for the audit trail —
-- this migration only adds the columns to hold that result.

alter table public.withdrawal_audit
  add column if not exists penalty_points integer,   -- negative = points deducted, null = no penalty
  add column if not exists penalty_reason  text;      -- e.g. 'No-Show (Championship Series 7-Day)'
