-- Phase 47 — Offline entry-fee payments
-- Run this in the Supabase SQL Editor AFTER phase43_event_payments.sql.
--
-- Razorpay isn't configured on every deployment yet (missing keys — see
-- api/razorpay-order.js), which was blocking self-entry for any paid event.
-- This adds an "enter now, pay offline" path: a player can self-enter a
-- paid event without going through Checkout, the entry is tagged
-- payment_status = 'pending', and the organiser marks it 'paid' by hand
-- once the cash/UPI-at-venue payment is received (or the online Checkout
-- flow completes, once keys are configured — see finalizePaidEntry).
--
-- Money-safety model (mirrors phase43's payments-ledger comment): a player
-- can only ever write 'pending' to their own row, never 'paid' — only the
-- organiser (week creator, via their existing "update draw entries" grant)
-- can flip it to 'paid'.

alter table public.draw_entries
  add column if not exists payment_status text
    check (payment_status in ('pending', 'paid'));

comment on column public.draw_entries.payment_status is
  'Entry-fee tracking for the offline-payment path. null = free event or online Razorpay entry (see payment_id). pending = self-entered into a paid event without paying yet. paid = organiser confirmed the offline payment.';

-- ─── Re-lock down player INSERT/UPDATE (phase15) ─────────────────────────────
-- Same policies as before, plus: a player can never write payment_status =
-- 'paid' on their own row (insert or update) — that transition is
-- organiser-only. (In practice self-entry inserts go through the
-- apply_self_entry_placement RPC below, which bypasses RLS as
-- SECURITY DEFINER — this is defense in depth for any direct-insert path.)
drop policy if exists "Player can self-enter an open event" on public.draw_entries;
create policy "Player can self-enter an open event"
  on public.draw_entries for insert
  to authenticated
  with check (
    entry_source = 'player'
    and player_id = auth.uid()
    and (payment_status is null or payment_status = 'pending')
    and exists (
      select 1 from public.events
      where id = event_id
        and entries_open = true
    )
  );

drop policy if exists "Player can update their own entry" on public.draw_entries;
create policy "Player can update their own entry"
  on public.draw_entries for update
  to authenticated
  using (player_id = auth.uid() and entry_source = 'player')
  with check (
    player_id = auth.uid() and entry_source = 'player'
    and (payment_status is null or payment_status = 'pending')
  );

-- ─── apply_self_entry_placement — set payment_status server-side ────────────
-- Ignores whatever (if anything) the client puts in p_new_row for payment
-- status; computes it from the event's own entry fee instead, same
-- server-authoritative principle as the rest of the paid-entry flow.
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
  v_fee_singles integer;
  v_payment_status text;
  v_bump jsonb;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select e.entries_open, tw.entry_fee_singles
    into v_entries_open, v_fee_singles
  from public.events e
  join public.tournament_weeks tw on tw.id = e.tournament_week_id
  where e.id = p_event_id;

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

  v_payment_status := case when coalesce(v_fee_singles, 0) > 0 then 'pending' else null end;

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
    player_id, entry_source, entry_status, entered_by, payment_status
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
    v_uid,
    v_payment_status
  )
  returning id into v_new_id;

  return query select * from public.draw_entries where id = v_new_id;
end;
$$;

revoke all on function public.apply_self_entry_placement(uuid, jsonb, jsonb) from public;
grant execute on function public.apply_self_entry_placement(uuid, jsonb, jsonb) to authenticated;
