-- ============================================================
-- PHASE 34 — Streak Freeze Days
-- See docs/ace-tracker-feature-gap-prd.md and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 1, item 1).
--
-- The streak itself (current/best consecutive logging days) is a derived
-- value computed client-side from existing matches.match_date +
-- training_sessions.session_date (see src/lib/streaks.js) — no table needed
-- for that. This migration only adds the one genuinely new piece of state:
-- user-declared "freeze" dates (e.g. travel/rest days) that count as
-- neither logged nor missed when computing a streak.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.streak_freezes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  freeze_date date not null,

  unique (user_id, freeze_date)
);

alter table public.streak_freezes enable row level security;

create policy "Users can view their own streak freezes"
  on public.streak_freezes for select
  using (auth.uid() = user_id);

create policy "Users can create their own streak freezes"
  on public.streak_freezes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own streak freezes"
  on public.streak_freezes for delete
  using (auth.uid() = user_id);

-- Same cross-user read pattern as matches/training_sessions/ranking_goals
-- (see phase30_matches_event_link.sql) — a coach's roster leaderboard needs
-- a linked player's freeze days to compute their streak accurately, same as
-- it already reads their matches/training sessions.
create policy "Linked coaches can view a player's streak freezes"
  on public.streak_freezes for select
  using (
    exists (
      select 1 from public.coach_player_links l
      where l.player_id = streak_freezes.user_id
        and l.coach_id = auth.uid()
        and l.status = 'active'
    )
  );

create index if not exists streak_freezes_user_idx
  on public.streak_freezes (user_id);
