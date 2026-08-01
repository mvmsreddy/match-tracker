-- Phase 43 — Tournament entry payments (Razorpay)
-- Run this in the Supabase SQL Editor AFTER phase20_self_entry_cascade_rpc.sql.
--
-- Adds a payments ledger for paid singles self-entry (see selfEnterSingles /
-- apply_self_entry_placement in phase20). Money-safety model:
--   - Only the server (Vercel functions using the service-role key) may ever
--     transition a row's status to 'paid' — no authenticated-role UPDATE
--     policy exists on this table, so a player can never mark their own
--     payment as paid via a direct client call.
--   - `apply_self_entry_placement` (phase20) is left completely unchanged.
--     Entry finalization after payment reuses it as-is via the player's own
--     session, then links the resulting draw_entries row back here.

create table if not exists public.event_payments (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  user_id             uuid not null references public.user_profiles(id) on delete cascade,
  amount              integer not null,              -- paise (INR smallest unit)
  currency            text not null default 'INR',
  razorpay_order_id   text not null unique,
  razorpay_payment_id text,
  razorpay_signature  text,
  status              text not null default 'created'
                        check (status in ('created', 'paid', 'failed', 'refunded')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.event_payments enable row level security;

-- Player can see their own payment rows (order status, receipts, the
-- "finish confirming your paid entry" recovery flow).
create policy "Player can view their own payments"
  on public.event_payments for select
  to authenticated
  using (user_id = auth.uid());

-- Organiser (the tournament week's creator) can see all payments for their
-- own events, for reconciliation — manual refunds still happen in the
-- Razorpay dashboard, this is read-only.
create policy "Week creator can view payments for their events"
  on public.event_payments for select
  to authenticated
  using (
    auth.uid() = (
      select tw.created_by from public.events e
      join public.tournament_weeks tw on tw.id = e.tournament_week_id
      where e.id = event_id
    )
  );

-- Player can create their own 'created' (pending) payment row when starting
-- checkout. They can never insert a row with status != 'created' — the
-- default handles that, and there is deliberately no column-level override
-- needed since status isn't client-settable here.
create policy "Player can create their own pending payment"
  on public.event_payments for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'created');

-- Deliberately no UPDATE policy for 'authenticated' — status transitions to
-- paid/failed only ever happen via the service-role key (razorpay-verify.js
-- / razorpay-webhook.js), after independently verifying Razorpay's signature.

create index if not exists event_payments_event_idx on public.event_payments (event_id);
create index if not exists event_payments_user_idx on public.event_payments (user_id);

-- Link a draw_entries row to the payment that unlocked it. Free events (no
-- entry fee) never set this — selfEnterSingles's existing flow is untouched.
alter table public.draw_entries
  add column if not exists payment_id uuid references public.event_payments(id) on delete set null;
