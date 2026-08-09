-- ============================================================
-- PHASE 54 — Live shared tracking sessions
--
-- While a match is tracked live, state is mirrored to
-- live_tracking_sessions so linked coaches/parents (and the
-- player) can watch point-by-point updates via Supabase Realtime.
--
-- Run AFTER phase53_proxy_tracking.sql
-- ============================================================

create table if not exists public.live_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  tracked_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'live' check (status in ('live', 'ended')),
  header jsonb not null default '{}'::jsonb,
  session_type text not null default 'match',
  format_preset text,
  format_custom text,
  point_target int,
  tracking_mode text,
  server_choice text not null default 'self',
  points jsonb not null default '[]'::jsonb,
  match_started boolean not null default false,
  match_start_time bigint,
  match_end_time bigint,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists live_tracking_sessions_player_live_idx
  on public.live_tracking_sessions (player_id, updated_at desc)
  where status = 'live';

alter table public.live_tracking_sessions enable row level security;

create or replace function public.can_view_live_tracking_for_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_player_id = auth.uid()
    or exists (
      select 1 from public.coach_player_links l
      where l.player_id = p_player_id
        and l.coach_id = auth.uid()
        and l.status = 'active'
    )
    or exists (
      select 1 from public.parent_player_links l
      where l.player_id = p_player_id
        and l.parent_id = auth.uid()
        and l.status = 'active'
    );
$$;

drop policy if exists "Live tracking session read" on public.live_tracking_sessions;
create policy "Live tracking session read"
  on public.live_tracking_sessions for select
  to authenticated
  using (
    tracked_by = auth.uid()
    or public.can_view_live_tracking_for_player(player_id)
  );

drop policy if exists "Tracker can insert live session" on public.live_tracking_sessions;
create policy "Tracker can insert live session"
  on public.live_tracking_sessions for insert
  to authenticated
  with check (
    tracked_by = auth.uid()
    and (
      player_id = auth.uid()
      or public.can_view_live_tracking_for_player(player_id)
    )
  );

drop policy if exists "Tracker can update own live session" on public.live_tracking_sessions;
create policy "Tracker can update own live session"
  on public.live_tracking_sessions for update
  to authenticated
  using (tracked_by = auth.uid())
  with check (tracked_by = auth.uid());

-- Realtime broadcast (same pattern as phase38 notifications).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_tracking_sessions'
  ) then
    alter publication supabase_realtime add table public.live_tracking_sessions;
  end if;
end $$;
