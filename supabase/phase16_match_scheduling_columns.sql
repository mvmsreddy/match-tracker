-- Phase 16 — Add Order-of-Play scheduling columns to event_matches
-- Run this in the Supabase SQL Editor.

alter table public.event_matches
  add column if not exists day_number   integer,
  add column if not exists court_number integer,
  add column if not exists match_order  integer,
  add column if not exists umpire       text;
