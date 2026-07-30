-- ============================================================
-- PHASE 40 — Messaging
-- See docs/ace-tracker-feature-gap-prd.md §2.2 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 3, item 8).
--
-- One thread per player (not one per coach/parent pair) — matches ACE
-- Tracker's model exactly: every coach/parent linked to a player posts into
-- that SAME thread, so it reads as one shared conversation around the
-- player rather than N separate 1:1 DMs. A thread is created lazily the
-- first time anyone messages about a given player (get_or_create pattern in
-- the app layer), not pre-created for every link.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.message_threads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  player_id   uuid not null unique references public.user_profiles(id) on delete cascade
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  thread_id   uuid not null references public.message_threads(id) on delete cascade,
  sender_id   uuid not null references public.user_profiles(id) on delete cascade,
  body        text not null check (char_length(body) <= 2000)
);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

-- A thread is visible to the player themself, or anyone with an active
-- coach/parent link to that player.
create policy "Player or linked coach/parent can view the thread"
  on public.message_threads for select
  using (
    auth.uid() = player_id
    or exists (select 1 from public.coach_player_links l where l.player_id = message_threads.player_id and l.coach_id = auth.uid() and l.status = 'active')
    or exists (select 1 from public.parent_player_links l where l.player_id = message_threads.player_id and l.parent_id = auth.uid() and l.status = 'active')
  );

-- Same set of people can create the thread (lazy-create on first message).
create policy "Player or linked coach/parent can create the thread"
  on public.message_threads for insert
  with check (
    auth.uid() = player_id
    or exists (select 1 from public.coach_player_links l where l.player_id = message_threads.player_id and l.coach_id = auth.uid() and l.status = 'active')
    or exists (select 1 from public.parent_player_links l where l.player_id = message_threads.player_id and l.parent_id = auth.uid() and l.status = 'active')
  );

-- Messages: same visibility as their thread, sender must be self.
create policy "Player or linked coach/parent can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (
          auth.uid() = t.player_id
          or exists (select 1 from public.coach_player_links l where l.player_id = t.player_id and l.coach_id = auth.uid() and l.status = 'active')
          or exists (select 1 from public.parent_player_links l where l.player_id = t.player_id and l.parent_id = auth.uid() and l.status = 'active')
        )
    )
  );

create policy "Player or linked coach/parent can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and (
          auth.uid() = t.player_id
          or exists (select 1 from public.coach_player_links l where l.player_id = t.player_id and l.coach_id = auth.uid() and l.status = 'active')
          or exists (select 1 from public.parent_player_links l where l.player_id = t.player_id and l.parent_id = auth.uid() and l.status = 'active')
        )
    )
  );

create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at);

-- Realtime — same pattern as phase38_realtime_notifications.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
