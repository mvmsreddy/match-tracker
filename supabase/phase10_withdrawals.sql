-- ============================================================
-- PHASE 10 — Withdrawals & Alternates (+ Lucky Losers)
-- Run in Supabase SQL Editor AFTER phase2_schema.sql
-- ============================================================

-- ----------------------------------------------------------
-- 1. draw_entries.is_withdrawn
-- ----------------------------------------------------------
alter table public.draw_entries
  add column if not exists is_withdrawn boolean not null default false;

-- ----------------------------------------------------------
-- 2. lucky_losers  (random-draw priority pool of qualifying
--    losers, callable into a withdrawn main-draw position)
-- ----------------------------------------------------------
create table if not exists public.lucky_losers (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  entry_id              uuid not null references public.draw_entries(id) on delete cascade,
  priority              integer not null,                 -- assigned by random draw; 1 = called first
  status                text not null default 'waiting',  -- 'waiting' | 'called_in'
  called_into_entry_id  uuid references public.draw_entries(id) on delete set null,
  created_at            timestamptz not null default now(),

  unique (event_id, entry_id)
);

alter table public.lucky_losers enable row level security;

drop policy if exists "Anyone authenticated can view lucky losers" on public.lucky_losers;
create policy "Anyone authenticated can view lucky losers"
  on public.lucky_losers for select
  to authenticated using (true);

drop policy if exists "Event week creator can insert lucky losers" on public.lucky_losers;
create policy "Event week creator can insert lucky losers"
  on public.lucky_losers for insert
  with check (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

drop policy if exists "Event week creator can update lucky losers" on public.lucky_losers;
create policy "Event week creator can update lucky losers"
  on public.lucky_losers for update
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

drop policy if exists "Event week creator can delete lucky losers" on public.lucky_losers;
create policy "Event week creator can delete lucky losers"
  on public.lucky_losers for delete
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

create index if not exists lucky_losers_event_idx
  on public.lucky_losers (event_id, priority);
