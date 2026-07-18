-- Phase 15 — Player self-entry RLS policies
-- Run this in the Supabase SQL Editor.
-- Allows authenticated players to insert their own draw entry and update/delete it.

-- ─── 1. Player can INSERT their own entry ────────────────────────────────────
-- Conditions:
--   • entry_source must be 'player'   (organisers always use 'organiser')
--   • player_id must equal the caller's uid
--   • entries_open must be true on the event at the time of insert
create policy "Player can self-enter an open event"
  on public.draw_entries for insert
  to authenticated
  with check (
    entry_source = 'player'
    and player_id = auth.uid()
    and exists (
      select 1 from public.events
      where id = event_id
        and entries_open = true
    )
  );

-- ─── 2. Player can UPDATE their own entry (e.g. withdraw) ────────────────────
create policy "Player can update their own entry"
  on public.draw_entries for update
  to authenticated
  using (player_id = auth.uid() and entry_source = 'player')
  with check (player_id = auth.uid() and entry_source = 'player');

-- ─── 3. Player can DELETE their own entry (optional — withdrawal uses update) ─
create policy "Player can delete their own entry"
  on public.draw_entries for delete
  to authenticated
  using (player_id = auth.uid() and entry_source = 'player');
