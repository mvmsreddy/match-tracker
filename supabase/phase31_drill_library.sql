-- ============================================================
-- PHASE 31 — Multi-Segment Dashboard: Drill Library
-- See C:\Users\madhu\.claude\plans\dreamy-wandering-lerdorf.md (Phase 6).
--
-- skill_groups is deliberately NOT a table here — "U14 Forehand Weakness: 3
-- players" is computed at read time (active coach_player_links joined with
-- each linked player's segment analytics, see src/lib/segmentAnalytics.js),
-- specifically so no persisted roll-up table shaped like the rejected
-- cascading-points idea gets built by accident. Cache later only if
-- performance demands it.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.drill_library (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users(id) on delete set null,  -- null = global/seed drill
  title             text not null,
  description       text,
  focus_stroke      text,      -- aligned to analytics.js's stroke categories: Forehand|Backhand|Serve|Volley|Smash — free text, not enforced, so a coach can name a non-stroke focus (e.g. "Footwork")
  difficulty        text,      -- 'beginner' | 'intermediate' | 'advanced' — free text
  video_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.drill_library enable row level security;

create policy "Authenticated users can view the drill library"
  on public.drill_library for select
  to authenticated
  using (true);

create policy "Coaches manage their own drills"
  on public.drill_library for all
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create index if not exists drill_library_focus_stroke_idx on public.drill_library (focus_stroke);
