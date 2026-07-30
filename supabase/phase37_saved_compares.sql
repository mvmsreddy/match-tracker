-- ============================================================
-- PHASE 37 — Saved Compare Views (player-vs-player)
-- See docs/ace-tracker-feature-gap-prd.md §2.6 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 2, item 5).
--
-- Bookmarkable (player_a, player_b, range) picks for the coach-side
-- "Players" compare mode on ComparePage.jsx. Player-vs-player comparison
-- itself needs no new table — it's computed at read time from matches the
-- coach already has RLS read access to (phase30_matches_event_link.sql) —
-- this migration only adds the save/reload layer on top.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.saved_compares (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  owner_id    uuid not null references public.user_profiles(id) on delete cascade,
  name        text not null,
  player_a_id uuid not null references public.user_profiles(id) on delete cascade,
  player_b_id uuid not null references public.user_profiles(id) on delete cascade,
  range       text not null default 'month'  -- 'week' | 'month' | 'quarter' | 'all'
);

alter table public.saved_compares enable row level security;

create policy "Users can view their own saved compares"
  on public.saved_compares for select
  using (auth.uid() = owner_id);

create policy "Users can create their own saved compares"
  on public.saved_compares for insert
  with check (auth.uid() = owner_id);

create policy "Users can delete their own saved compares"
  on public.saved_compares for delete
  using (auth.uid() = owner_id);

create index if not exists saved_compares_owner_idx
  on public.saved_compares (owner_id);
