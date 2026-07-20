-- Phase 20: Fix real-time cascading self-entry placement under RLS
-- Run this in Supabase SQL Editor AFTER phase19_organiser_extra_fields.sql
--
-- Player self-entry RLS (phase15) only lets a player insert/update their OWN
-- draw_entries row (player_id = auth.uid()). Cascading placement (nominationSort.js)
-- can require demoting an EXISTING entry that belongs to someone else — e.g.
-- an organiser-added player, or another self-entered player — which no
-- authenticated player has permission to update directly. This function runs
-- the whole placement (bumps + insert) as SECURITY DEFINER, re-validating the
-- essential constraints itself since it bypasses RLS.

create or replace function public.apply_self_entry_placement(
  p_event_id uuid,
  p_bumps jsonb,     -- array of {id, draw_type, position, is_alternate}
  p_new_row jsonb    -- the new entrant's draw_entries row (snake_case keys)
)
returns setof public.draw_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entries_open boolean;
  v_bump jsonb;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select entries_open into v_entries_open from public.events where id = p_event_id;
  if v_entries_open is not true then
    raise exception 'Entries are not open for this event';
  end if;

  if (p_new_row->>'event_id')::uuid is distinct from p_event_id then
    raise exception 'Event mismatch';
  end if;
  if (p_new_row->>'player_id')::uuid is distinct from v_uid then
    raise exception 'Can only self-enter your own account';
  end if;
  if (p_new_row->>'entry_source') is distinct from 'player' then
    raise exception 'Invalid entry source';
  end if;

  -- Bumps only ever move entries already in this event to a different
  -- draw_type/position/is_alternate — never touch identity fields.
  for v_bump in select * from jsonb_array_elements(p_bumps)
  loop
    update public.draw_entries
    set draw_type = v_bump->>'draw_type',
        position = (v_bump->>'position')::int,
        is_alternate = coalesce((v_bump->>'is_alternate')::boolean, false)
    where id = (v_bump->>'id')::uuid
      and event_id = p_event_id;
  end loop;

  insert into public.draw_entries (
    event_id, draw_type, position, is_bye, is_alternate,
    family_name, first_name, aita_reg, player_state, ranking, date_of_birth,
    player_id, entry_source, entry_status, entered_by
  ) values (
    p_event_id,
    p_new_row->>'draw_type',
    (p_new_row->>'position')::int,
    false,
    coalesce((p_new_row->>'is_alternate')::boolean, false),
    p_new_row->>'family_name',
    p_new_row->>'first_name',
    p_new_row->>'aita_reg',
    p_new_row->>'player_state',
    (p_new_row->>'ranking')::int,
    (p_new_row->>'date_of_birth')::date,
    v_uid,
    'player',
    'placed',
    v_uid
  )
  returning id into v_new_id;

  return query select * from public.draw_entries where id = v_new_id;
end;
$$;

revoke all on function public.apply_self_entry_placement(uuid, jsonb, jsonb) from public;
grant execute on function public.apply_self_entry_placement(uuid, jsonb, jsonb) to authenticated;
