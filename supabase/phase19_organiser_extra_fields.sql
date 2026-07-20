-- Phase 19: Extra organiser fields — stringing charges, hotel info,
-- AITA card requirement (week-level), sign-in window & play dates (category-level)
-- Run this in Supabase SQL Editor AFTER phase18_withdrawal_audit.sql

-- ─── 1. ALTER tournament_weeks ─────────────────────────────────────────────────
alter table public.tournament_weeks
  add column if not exists stringing_charges  text,
  add column if not exists aita_card_required boolean not null default false,
  add column if not exists hotel_options      jsonb not null default '[]'::jsonb;
  -- hotel_options: [{ name, address, phone, roomRate, breakfastIncluded, distanceToVenue }]

-- ─── 2. ALTER events ────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists signin_date       date,
  add column if not exists signin_time       time,
  add column if not exists first_day_of_play date,
  add column if not exists last_day_of_play  date;
