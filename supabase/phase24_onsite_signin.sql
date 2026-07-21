-- Phase 24: Onsite/walk-in sign-in flag for alternates
-- Run this in Supabase SQL Editor AFTER phase2_schema.sql
--
-- Verified against the source PDF: the qualifying sign-in list names three
-- distinct groups together — "qualifying list, alternate list, or any
-- onsite alternate" — implying online/ranked Alternates (from the acceptance
-- process) are a different pool from walk-in "onsite alternates" who sign
-- in fresh at the venue with no prior ranked registration. Once entries are
-- frozen, a referee filling a qualifying vacancy should exhaust the ranked
-- Alternates list before considering onsite sign-ins.

alter table public.draw_entries
  add column if not exists is_onsite_signin boolean not null default false;
