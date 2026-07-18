-- ============================================================
-- PHASE 12 — Fact Sheet Alignment
-- Adds fields surfaced by comparing the app against a real AITA
-- tournament factsheet: grade/series, entry/withdrawal deadlines,
-- a separate qualifying date range, officials contact info, and
-- basic venue/fee facts. Run in Supabase SQL Editor.
-- ============================================================

alter table public.tournament_weeks
  add column if not exists grade                text,     -- "National Series" / "State" / "ITF Grade 5" etc.
  add column if not exists entry_deadline        date,
  add column if not exists withdrawal_deadline   date,
  add column if not exists qualifying_start_date date,     -- qualifying's own first day (may precede start_date)
  add column if not exists qualifying_end_date   date,
  add column if not exists director_name         text,
  add column if not exists director_phone        text,
  add column if not exists director_email        text,
  add column if not exists referee_phone         text,
  add column if not exists referee_email         text,
  add column if not exists venue_address         text,
  add column if not exists venue_pincode         text,
  add column if not exists venue_phone           text,
  add column if not exists ball_brand            text,
  add column if not exists has_floodlights       boolean,
  add column if not exists entry_fee_singles     integer,  -- ₹
  add column if not exists entry_fee_doubles     integer,  -- ₹
  add column if not exists daily_allowance       integer,  -- ₹ per day, main draw players
  add column if not exists signin_instructions   text;     -- free text, e.g. "Qualifying sign-in: Fri 17 Jul, 12-2pm at venue"
