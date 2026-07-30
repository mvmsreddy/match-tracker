-- ============================================================
-- PHASE 33 — Parent Role Foundation
-- See docs/ace-tracker-feature-gap-prd.md and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md.
--
-- Adds 'parent' as a selectable role (user_profiles.role is already an
-- unconstrained text column — 'player' | 'coach' | 'organizer' today — so no
-- schema change is needed there, only new UI/app-layer support).
--
-- New delegation table, parent_player_links, mirroring coach_player_links
-- (phase1_profiles_schema.sql) exactly in shape and RLS pattern. Kept as a
-- separate table rather than adding a `relation` column to
-- coach_player_links, to avoid touching any of that table's existing
-- consumers/policies across phase1/phase29/phase30/phase32.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.parent_player_links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  parent_id   uuid not null references public.user_profiles(id) on delete cascade,
  player_id   uuid not null references public.user_profiles(id) on delete cascade,
  status      text not null default 'pending',  -- 'pending' | 'active' | 'declined'

  unique (parent_id, player_id)
);

alter table public.parent_player_links enable row level security;

-- Parent and player both see their own links
create policy "Users can view their own parent links"
  on public.parent_player_links for select
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = player_id);

-- Only parents can create link requests
create policy "Parents can create link requests"
  on public.parent_player_links for insert
  with check (auth.uid() = parent_id);

-- Either party can update (player accepts/declines; parent can cancel)
create policy "Either party can update parent link status"
  on public.parent_player_links for update
  using (auth.uid() = parent_id or auth.uid() = player_id);

-- Either party can delete (unlink)
create policy "Either party can delete a parent link"
  on public.parent_player_links for delete
  using (auth.uid() = parent_id or auth.uid() = player_id);

create trigger parent_player_links_updated_at
  before update on public.parent_player_links
  for each row execute procedure update_updated_at();

create index if not exists parent_player_links_parent_idx
  on public.parent_player_links (parent_id, status);

create index if not exists parent_player_links_player_idx
  on public.parent_player_links (player_id, status);

-- ----------------------------------------------------------
-- Read-only visibility: parents get the same read access to a linked
-- player's core data that this migration's siblings will need to check
-- against as later phases add nutrition/messaging/etc. Nothing else reads
-- parent_player_links yet — this migration only establishes the table and
-- RLS; per-domain policies are added by the migrations that introduce those
-- domains (see the phased plan).
-- ----------------------------------------------------------
