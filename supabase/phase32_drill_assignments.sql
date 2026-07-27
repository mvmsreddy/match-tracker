-- ============================================================
-- PHASE 32 — Coach Intelligence System: Drill Assignments
-- See C:\Users\madhu\.claude\plans\virtual-kindling-shamir.md.
--
-- drill_library (Phase 31) has no assignment linkage and no volume/
-- frequency/duration spec fields, and skill-group derivation (see
-- src/lib/coachAnalytics.js) has no persisted "did this actually work"
-- signal. This migration adds both, real (not cached/fabricated): a coach
-- assigns a real drill to a real set of players for a real date range, and
-- Progress Correlation (computeDrillCorrelation) reads real matches before/
-- after that range to measure it.
--
-- No new RLS needed for coach read-access to draw_entries — checked: its
-- existing "Anyone authenticated can view draw entries" policy (phase2_
-- schema.sql) already covers it.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ----------------------------------------------------------
-- 1. drill_library — add spec fields + a fixed skill_key taxonomy shared
--    with skill-group derivation (distinct from the existing free-text
--    focus_stroke, which stays as display-only labeling).
-- ----------------------------------------------------------
alter table public.drill_library
  add column if not exists skill_key                  text,   -- Forehand|Backhand|Serve|Volley|Smash|BreakPointConversion|SecondServe|other free text for library-only tags
  add column if not exists default_volume              text,   -- e.g. '1,000 balls', '24 games' — display only
  add column if not exists default_frequency_per_week   integer,
  add column if not exists default_duration_weeks       integer;

create index if not exists drill_library_skill_key_idx on public.drill_library (skill_key);

-- ----------------------------------------------------------
-- 2. drill_assignments — a coach assigning one real drill to a real set of
--    their players, for a real date range. This is the record Progress
--    Correlation and "today's assigned block" (Log Session) both read.
-- ----------------------------------------------------------
create table if not exists public.drill_assignments (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references auth.users(id) on delete cascade,
  drill_id              uuid not null references public.drill_library(id) on delete cascade,
  category              text not null,        -- 'Boys'|'Girls'|'Men'|'Women' — matches aita_rankings taxonomy
  subcategory           text not null,        -- 'U-12'|'U-14'|...
  skill_key             text not null,        -- copied from the drill at assignment time (drill's default may change later)
  player_ids            uuid[] not null default '{}',
  frequency_per_week    integer not null,
  duration_weeks        integer not null,
  start_date            date not null default current_date,
  status                text not null default 'active',  -- 'active' | 'completed' | 'cancelled'
  created_at            timestamptz not null default now()
);

alter table public.drill_assignments enable row level security;

create policy "Coaches manage their own drill assignments"
  on public.drill_assignments for all
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- A linked, active player can see assignments they're part of — same
-- cross-user read pattern ranking_goals/training_sessions already use.
create policy "Assigned players can view their own assignments"
  on public.drill_assignments for select
  using (
    auth.uid() = any(player_ids)
    and exists (
      select 1 from public.coach_player_links l
      where l.coach_id = drill_assignments.coach_id
        and l.player_id = auth.uid()
        and l.status = 'active'
    )
  );

create index if not exists drill_assignments_coach_idx on public.drill_assignments (coach_id, status);

-- ----------------------------------------------------------
-- 3. Seed drills — the Coach Intelligence System mockup's own starter
--    library, as real global rows (created_by = null, matching drill_
--    library's existing "null = global/seed drill" convention). Guarded by
--    title (among global rows) rather than a table-wide unique constraint,
--    since coaches' own custom drills shouldn't be forced unique by title.
-- ----------------------------------------------------------
insert into public.drill_library (created_by, title, description, focus_stroke, difficulty, skill_key, default_volume, default_frequency_per_week, default_duration_weeks)
select * from (values
  (null::uuid, 'Forehand depth ladder',
   'Cross-court forehands landing past the service line, progressing from static feed to moving feed to live rally. Depth target tightens each set.',
   'Forehand', 'intermediate', 'Forehand', '1,000 balls', 3, 6),
  (null::uuid, 'Break-point simulation',
   'Play out games started at 30-40 and 0-40. Server must hold; returner must convert. No basket feed — every point is live and consequential.',
   'Other', 'advanced', 'BreakPointConversion', '24 games', 2, 4),
  (null::uuid, 'Kick serve target zones',
   'Second serves into three marked zones, weighted to the backhand corner. Score kept per set of twenty; player calls the target before the toss.',
   'Serve', 'intermediate', 'SecondServe', '340 serves', 2, 4),
  (null::uuid, 'Extended rally consistency',
   'Twenty-ball sets with no winner attempts. Builds the tolerance that shows up past the ninth shot.',
   'Other', 'intermediate', 'RallyTolerance', '20-ball sets', 3, 8),
  (null::uuid, 'Deciding-set serve routine',
   'Serve blocks run at the end of session, deliberately fatigued, to hold first-serve percentage in third sets.',
   'Serve', 'advanced', 'ServeUnderFatigue', '200 serves', 2, 4),
  (null::uuid, 'Slice defence rally',
   'Basket-fed slice recovery from deep behind the baseline.',
   'Backhand', 'intermediate', 'Backhand', '400 balls', 3, 6)
) as seed(created_by, title, description, focus_stroke, difficulty, skill_key, default_volume, default_frequency_per_week, default_duration_weeks)
where not exists (
  select 1 from public.drill_library dl
  where dl.created_by is null and dl.title = seed.title
);
