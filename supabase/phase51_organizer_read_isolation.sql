-- ============================================================
-- PHASE 51 — Organizer read isolation
--
-- Replaces world-readable SELECT policies on tournament tables so:
--   • Week owners always see their own management data
--   • Other users only see weeks/events/entries that are public
--     (entries open, draw published) or their own enrollment
--   • Pre-publish entry lists are owner-only
--
-- Run in Supabase SQL Editor AFTER prior phase files.
-- ============================================================

-- Helper functions (security definer so policies can reuse them cleanly)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.is_tournament_week_owner(week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_weeks tw
    where tw.id = week_id and tw.created_by = auth.uid()
  );
$$;

create or replace function public.is_event_week_owner(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    join public.tournament_weeks tw on tw.id = e.tournament_week_id
    where e.id = p_event_id and tw.created_by = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_week(week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.draw_entries de
    join public.events e on e.id = de.event_id
    where e.tournament_week_id = week_id
      and (de.player_id = auth.uid() or de.partner_id = auth.uid())
  );
$$;

create or replace function public.week_has_public_surface(week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.tournament_week_id = week_id
      and (coalesce(e.entries_open, false) = true or e.status <> 'setup')
  );
$$;

create or replace function public.event_is_public(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (coalesce(e.entries_open, false) = true or e.status <> 'setup')
  );
$$;

-- ----------------------------------------------------------
-- tournament_weeks
-- ----------------------------------------------------------
drop policy if exists "Anyone authenticated can view tournament weeks" on public.tournament_weeks;

create policy "Scoped tournament week read"
  on public.tournament_weeks for select
  to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()
    or public.is_enrolled_in_week(id)
    or public.week_has_public_surface(id)
  );

-- ----------------------------------------------------------
-- events
-- ----------------------------------------------------------
drop policy if exists "Anyone authenticated can view events" on public.events;

create policy "Scoped event read"
  on public.events for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_tournament_week_owner(tournament_week_id)
    or public.is_enrolled_in_week(tournament_week_id)
    or public.event_is_public(id)
  );

-- ----------------------------------------------------------
-- draw_entries — pre-publish lists are owner-only
-- ----------------------------------------------------------
drop policy if exists "Anyone authenticated can view draw entries" on public.draw_entries;

create policy "Scoped draw entry read"
  on public.draw_entries for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_event_week_owner(event_id)
    or player_id = auth.uid()
    or partner_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = draw_entries.event_id
        and e.status <> 'setup'
    )
  );

-- ----------------------------------------------------------
-- event_matches
-- ----------------------------------------------------------
drop policy if exists "Anyone authenticated can view event matches" on public.event_matches;

create policy "Scoped event match read"
  on public.event_matches for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_event_week_owner(event_id)
    or exists (
      select 1 from public.draw_entries de
      where de.event_id = event_matches.event_id
        and (de.player_id = auth.uid() or de.partner_id = auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = event_matches.event_id
        and e.status <> 'setup'
    )
  );

-- ----------------------------------------------------------
-- lucky_losers (phase10)
-- ----------------------------------------------------------
drop policy if exists "Authenticated users can view lucky losers" on public.lucky_losers;

create policy "Scoped lucky loser read"
  on public.lucky_losers for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_event_week_owner(event_id)
    or exists (
      select 1 from public.events e
      where e.id = lucky_losers.event_id
        and e.status <> 'setup'
    )
  );

-- ----------------------------------------------------------
-- aita_participation_interest — let claimed-tournament owners read
-- pre-declarations for their events (phase46 resolve flow)
-- ----------------------------------------------------------
create policy "Organizer views interest for owned claimed tournaments"
  on public.aita_participation_interest for select
  using (
    exists (
      select 1
      from public.aita_tournaments at
      join public.tournament_weeks tw on tw.id = at.linked_tournament_week_id
      where at.id = aita_participation_interest.aita_tournament_id
        and tw.created_by = auth.uid()
    )
  );
