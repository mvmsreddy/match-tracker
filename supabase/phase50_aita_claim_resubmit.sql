-- ============================================================
-- PHASE 50 — Let an organizer resubmit a claim (fixes a duplicate-key error)
-- Extends phase46_aita_organizer_claims.sql.
--
-- aita_organizer_claims has unique(aita_tournament_id, claimed_by), and
-- claimAitaTournamentAsOrganizer used a plain insert — so any organizer
-- who already has a claim row for a tournament (approved, rejected, or
-- otherwise) hits "duplicate key value violates unique constraint
-- aita_organizer_claims_aita_tournament_id_claimed_by_key" trying to claim
-- it again. Confirmed live: happens after deleting the tournament_weeks row
-- an earlier approval created — linked_tournament_week_id resets to null
-- (on delete set null), so the Calendar page offers "Claim as Organizer"
-- again, but the old claim row (still 'approved') is still there.
--
-- Fix: claimAitaTournamentAsOrganizer now upserts, resetting the existing
-- row back to 'pending' instead of inserting a fresh one. That upsert's
-- ON CONFLICT branch is an UPDATE under the hood, so it needs its own RLS
-- policy — the existing "Only super_admin reviews claims" update policy
-- doesn't cover the claimant updating their own row, only an admin's
-- review action.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create policy "Claimant can resubmit their own claim"
  on public.aita_organizer_claims for update
  using (auth.uid() = claimed_by)
  with check (auth.uid() = claimed_by and status = 'pending');
