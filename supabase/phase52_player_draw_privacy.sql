-- Phase 52: Tighten public draw_entries read — only after draw is published
-- Run AFTER phase51_organizer_read_isolation.sql
--
-- phase51 granted read to any non-setup event, which exposes acceptance
-- lists once an organizer flips status early. Published draws are
-- draw_ready | in_progress | complete.

drop policy if exists "Scoped draw entry read" on public.draw_entries;

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
        and e.status in ('draw_ready', 'in_progress', 'complete')
    )
  );

drop policy if exists "Scoped event match read" on public.event_matches;

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
        and e.status in ('draw_ready', 'in_progress', 'complete')
    )
  );

drop policy if exists "Scoped lucky loser read" on public.lucky_losers;

create policy "Scoped lucky loser read"
  on public.lucky_losers for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_event_week_owner(event_id)
    or exists (
      select 1 from public.events e
      where e.id = lucky_losers.event_id
        and e.status in ('draw_ready', 'in_progress', 'complete')
    )
  );
