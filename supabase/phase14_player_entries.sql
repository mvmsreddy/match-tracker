-- Phase 14: Player Self-Entry, Doubles Invitations, Event Entry Controls
-- Run this in Supabase SQL editor

-- ─── 1. ALTER draw_entries ────────────────────────────────────────────────────
alter table public.draw_entries
  add column if not exists entry_source    text default 'organiser',  -- 'organiser' | 'player'
  add column if not exists entry_status    text default 'placed',     -- 'pending' | 'placed' | 'withdrawn'
  add column if not exists entered_by      uuid references auth.users(id),
  add column if not exists withdrawal_date date,
  add column if not exists withdrawal_type text;                      -- 'W' | 'LW' | 'NS'

-- ─── 2. ALTER events ─────────────────────────────────────────────────────────
alter table public.events
  add column if not exists max_main_direct   integer,   -- direct acceptance slots (e.g. 39 for NS Girls 48 draw)
  add column if not exists max_qual_direct   integer,   -- qualifying direct slots (e.g. 28 for qual 32)
  add column if not exists entries_open      boolean default false,
  add column if not exists entry_open_date   date,
  add column if not exists entry_close_date  date;

-- ─── 3. CREATE doubles_invitations ───────────────────────────────────────────
create table if not exists public.doubles_invitations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid references public.events(id) on delete cascade,
  inviter_user_id  uuid references auth.users(id),
  invitee_user_id  uuid references auth.users(id),
  inviter_aita_reg text,
  invitee_aita_reg text,
  status           text default 'pending',  -- 'pending' | 'accepted' | 'declined' | 'expired'
  created_at       timestamptz default now(),
  responded_at     timestamptz
);

-- index for quick lookup of pending invitations by invitee
create index if not exists doubles_invitations_invitee_idx
  on public.doubles_invitations(invitee_user_id, status);

create index if not exists doubles_invitations_event_idx
  on public.doubles_invitations(event_id);

-- ─── 4. RLS for doubles_invitations ──────────────────────────────────────────
alter table public.doubles_invitations enable row level security;

-- Anyone involved (inviter or invitee) can read their own invitations
create policy "doubles_invitations_read" on public.doubles_invitations
  for select using (
    auth.uid() = inviter_user_id or auth.uid() = invitee_user_id
  );

-- Inviter can create
create policy "doubles_invitations_insert" on public.doubles_invitations
  for insert with check (auth.uid() = inviter_user_id);

-- Invitee can update (accept/decline)
create policy "doubles_invitations_update" on public.doubles_invitations
  for update using (auth.uid() = invitee_user_id);

-- Either party can delete (cancel)
create policy "doubles_invitations_delete" on public.doubles_invitations
  for delete using (
    auth.uid() = inviter_user_id or auth.uid() = invitee_user_id
  );

-- ─── 5. Backfill existing draw_entries ───────────────────────────────────────
update public.draw_entries
set entry_source = 'organiser',
    entry_status = case when is_withdrawn then 'withdrawn' else 'placed' end
where entry_source is null;

-- ─── 6. Backfill max_main_direct and max_qual_direct on existing events ──────
-- Formula: max_main_direct = draw_size - 9 (8 qualifiers + 1 SE)
--          max_qual_direct  = qualifying_size - 4 (4 wild cards)
update public.events
set max_main_direct = draw_size - 9
where max_main_direct is null and draw_size is not null and draw_size > 9;

update public.events
set max_qual_direct = qualifying_size - 4
where max_qual_direct is null and qualifying_size is not null and qualifying_size > 4;
