-- ============================================================
-- PHASE 53 — Proxy tracking (coach/parent saves to player account)
--
-- Lets an active linked coach or parent log point-by-point data that
-- lands on the player's matches row, with tracked_by recording who
-- actually entered it courtside.
--
-- Run AFTER phase30_matches_event_link.sql and phase33_parent_role.sql
-- ============================================================

alter table public.matches
  add column if not exists tracked_by uuid references auth.users(id) on delete set null;

alter table public.matches
  add column if not exists tracking_mode text;

create index if not exists matches_tracked_by_idx
  on public.matches (tracked_by)
  where tracked_by is not null;

-- Parents can read linked players' matches (mirrors coach policy in phase30).
drop policy if exists "Linked parents can view a player's matches" on public.matches;
create policy "Linked parents can view a player's matches"
  on public.matches for select
  using (
    exists (
      select 1 from public.parent_player_links l
      where l.player_id = matches.user_id
        and l.parent_id = auth.uid()
        and l.status = 'active'
    )
  );

-- Linked coach/parent can insert a match owned by the player.
drop policy if exists "Linked delegates can save matches for their player" on public.matches;
create policy "Linked delegates can save matches for their player"
  on public.matches for insert
  with check (
    tracked_by = auth.uid()
    and user_id <> auth.uid()
    and (
      exists (
        select 1 from public.coach_player_links l
        where l.player_id = matches.user_id
          and l.coach_id = auth.uid()
          and l.status = 'active'
      )
      or exists (
        select 1 from public.parent_player_links l
        where l.player_id = matches.user_id
          and l.parent_id = auth.uid()
          and l.status = 'active'
      )
    )
  );

-- Delegate who tracked can retroactively append points (phase35 path).
drop policy if exists "Delegates can update matches they tracked" on public.matches;
create policy "Delegates can update matches they tracked"
  on public.matches for update
  using (tracked_by = auth.uid())
  with check (tracked_by = auth.uid());
