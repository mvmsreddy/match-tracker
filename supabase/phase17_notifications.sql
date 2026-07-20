-- Phase 17: In-app notifications
-- Run this in Supabase SQL Editor AFTER phase16_match_scheduling_columns.sql

-- ─── 1. CREATE notifications ──────────────────────────────────────────────────
create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null,   -- 'entries_open' | 'draw_published' | 'withdrawal_replacement' | 'qualifier_promoted'
  title               text not null,
  body                text,
  tournament_week_id  uuid references public.tournament_weeks(id) on delete cascade,
  event_id            uuid references public.events(id) on delete cascade,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, is_read, created_at desc);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (
    auth.uid() = user_id
    or auth.uid() = (
      select tw.created_by
      from public.tournament_weeks tw
      where tw.id = tournament_week_id
    )
    or auth.uid() = (
      select tw.created_by
      from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update using (auth.uid() = user_id);

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (auth.uid() = user_id);
