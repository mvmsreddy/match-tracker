-- ============================================================
-- PHASE 30 — Multi-Segment Dashboard: Tracker/Tournament Linking
-- See C:\Users\madhu\.claude\plans\dreamy-wandering-lerdorf.md (Phase 4).
-- public.matches (the personal match-tracker table) already exists and is
-- already persisted server-side (confirmed while planning this feature —
-- it is NOT localStorage-only). This migration just adds the two columns
-- needed to link a tracker session to the official tournament match it came
-- from, and to a normalized segment key so it can be aggregated alongside
-- aita_rankings/events data despite the three different age-group string
-- conventions in this codebase (see governingBodies.js's normalize* helpers).
--
-- Run in Supabase SQL Editor.
-- ============================================================

alter table public.matches
  add column if not exists event_match_id uuid references public.event_matches(id) on delete set null;

-- Both halves of the segment key are needed — subcategory alone ('U-14') is
-- shared between Boys and Girls, so filtering on it without category would
-- silently merge two different segments' matches together.
alter table public.matches
  add column if not exists normalized_category text;      -- e.g. 'Boys' — governingBodies.js taxonomy
alter table public.matches
  add column if not exists normalized_subcategory text;    -- e.g. 'U-14' — governingBodies.js taxonomy, not a ranking computation

create index if not exists matches_user_normalized_segment_idx
  on public.matches (user_id, normalized_category, normalized_subcategory);
