-- ============================================================
-- PHASE 55 — Player activity / match-volume targets
-- Monthly match target + minimum floor (e.g. 10/month, min 5).
-- Run in Supabase SQL Editor after phase29.
-- ============================================================

create table if not exists public.player_activity_goals (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references auth.users(id) on delete cascade,
  monthly_target    integer not null default 10 check (monthly_target between 1 and 60),
  minimum_matches   integer not null default 5 check (minimum_matches between 1 and 30),
  updated_at        timestamptz not null default now(),
  unique (player_id)
);

alter table public.player_activity_goals enable row level security;

create policy "Players manage their own activity goals"
  on public.player_activity_goals for all
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

create policy "Linked coaches can view a player's activity goals"
  on public.player_activity_goals for select
  using (
    exists (
      select 1 from public.coach_player_links l
      where l.player_id = player_activity_goals.player_id
        and l.coach_id = auth.uid()
        and l.status = 'active'
    )
  );

create policy "Linked parents can view a player's activity goals"
  on public.player_activity_goals for select
  using (
    exists (
      select 1 from public.parent_player_links l
      where l.player_id = player_activity_goals.player_id
        and l.parent_id = auth.uid()
        and l.status = 'active'
    )
  );
