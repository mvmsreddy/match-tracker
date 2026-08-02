-- ============================================================
-- PHASE 46 — Organizer claims on AITA Calendar tournaments
-- Extends phase45_aita_crowdsourced.sql.
--
-- Lets a verified real-world organizer "claim" an AITA-calendar tournament
-- they actually run, instead of it only ever being crowdsourced from player
-- uploads. A super_admin approves the claim; on approval a real
-- tournament_weeks row is created (source='aita_claimed', created_by = the
-- claiming organizer) and the AITA calendar row is marked "live on the
-- platform" via the same linked_tournament_week_id column phase45 already
-- added — from that point the organizer runs it through the completely
-- normal organizer flow (add events, entries, draw, scores), and the
-- crowdsourced player-upload path for that tournament is retired (the app
-- layer hides it once linked_tournament_week_id is set).
--
-- Players who already declared "I'm playing" (aita_participation_interest)
-- before the claim aren't lost — they surface as an accept/decline list on
-- the organizer's matching event page once they create one (see
-- getUnresolvedAitaInterestForEvent / resolveAitaInterest in
-- src/api/supabaseApi.js), carried via the two new columns below.
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ----------------------------------------------------------
-- 1. aita_organizer_claims — one row per organizer's claim request on an
--    AITA calendar tournament.
-- ----------------------------------------------------------
create table if not exists public.aita_organizer_claims (
  id                  uuid primary key default gen_random_uuid(),
  aita_tournament_id  uuid not null references public.aita_tournaments(id) on delete cascade,
  claimed_by          uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at          timestamptz not null default now(),
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  tournament_week_id  uuid references public.tournament_weeks(id) on delete set null,

  unique (aita_tournament_id, claimed_by)
);

alter table public.aita_organizer_claims enable row level security;

create policy "Claimant views own claim, super_admin views all"
  on public.aita_organizer_claims for select
  using (
    auth.uid() = claimed_by
    or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
  );

create policy "Organizer can submit a claim"
  on public.aita_organizer_claims for insert
  with check (
    auth.uid() = claimed_by
    and exists (select 1 from public.user_profiles where id = auth.uid() and role = 'organizer')
  );

create policy "Only super_admin reviews claims"
  on public.aita_organizer_claims for update
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create index if not exists aita_organizer_claims_tournament_idx
  on public.aita_organizer_claims (aita_tournament_id, status);

-- ----------------------------------------------------------
-- 2. aita_participation_interest gets two columns to track how a
--    pre-existing "I'm playing" declaration was resolved once a claimed
--    tournament's matching event exists and the organizer acts on it.
-- ----------------------------------------------------------
alter table public.aita_participation_interest
  add column if not exists resolved_event_id uuid references public.events(id) on delete set null,
  add column if not exists resolved_entry_id  uuid references public.draw_entries(id) on delete set null;
-- status values grow to also include 'accepted' | 'declined' (still free
-- text, no constraint to update — see phase45's status column).

-- The existing "Player updates their own interest" policy (phase45) only
-- covers the player themselves (e.g. withdrawing). This ADDS a second,
-- independent update policy (RLS permissive policies OR together) so the
-- organizer who now owns the claimed tournament can resolve a player's
-- interest row into an accept/decline decision.
create policy "Organizer resolves interest for their claimed tournament"
  on public.aita_participation_interest for update
  using (
    exists (
      select 1 from public.aita_tournaments t
      join public.tournament_weeks tw on tw.id = t.linked_tournament_week_id
      where t.id = aita_participation_interest.aita_tournament_id
        and tw.created_by = auth.uid()
    )
  );
