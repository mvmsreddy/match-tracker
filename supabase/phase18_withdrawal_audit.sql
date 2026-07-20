-- Phase 18: Withdrawal audit log
-- Run this in Supabase SQL Editor AFTER phase17_notifications.sql

-- ─── 1. CREATE withdrawal_audit ───────────────────────────────────────────────
-- Snapshot columns (player_name/aita_reg) exist because callInReplacement()
-- overwrites the withdrawn entry's row in place once a replacement is called
-- in — this table is the only place the original occupant's identity survives.
create table if not exists public.withdrawal_audit (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  entry_id              uuid references public.draw_entries(id) on delete set null,
  draw_type             text not null,
  player_name           text not null,
  aita_reg              text,
  player_id             uuid references public.user_profiles(id) on delete set null,
  withdrawal_type       text not null,   -- 'W' | 'LW' | 'NS'
  withdrawal_date       date not null,
  initiated_by          text not null,   -- 'self' | 'referee'
  initiated_by_user_id  uuid references auth.users(id),
  replacement_name      text,
  replacement_entry_id  uuid references public.draw_entries(id) on delete set null,
  replacement_source    text,            -- 'alternate' | 'lucky_loser'
  created_at            timestamptz not null default now()
);

create index if not exists withdrawal_audit_event_idx
  on public.withdrawal_audit(event_id, created_at desc);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────────
alter table public.withdrawal_audit enable row level security;

drop policy if exists "withdrawal_audit_select" on public.withdrawal_audit;
create policy "withdrawal_audit_select" on public.withdrawal_audit
  for select using (
    auth.uid() = (
      select tw.created_by
      from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

drop policy if exists "withdrawal_audit_insert" on public.withdrawal_audit;
create policy "withdrawal_audit_insert" on public.withdrawal_audit
  for insert with check (auth.uid() = initiated_by_user_id);

drop policy if exists "withdrawal_audit_update" on public.withdrawal_audit;
create policy "withdrawal_audit_update" on public.withdrawal_audit
  for update using (
    auth.uid() = initiated_by_user_id
    or auth.uid() = (
      select tw.created_by
      from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );
