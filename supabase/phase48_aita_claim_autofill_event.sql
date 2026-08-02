-- ============================================================
-- PHASE 48 — RLS fix for auto-filling an event on organizer-claim approval
-- Extends phase47_aita_admin_rls_fixes.sql.
--
-- approveAitaOrganizerClaim (src/api/supabaseApi.js) now also creates a
-- starting event pre-filled from the official AITA data (age group +
-- category + grade-derived draw defaults) so the organizer doesn't land on
-- an empty tournament. Same root cause as phase47: the super_admin session
-- performs the insert, but events' existing RLS policy requires
-- auth.uid() = the week's created_by, which is the ORGANIZER here, not the
-- super_admin approving the claim.
--
-- Run in Supabase SQL Editor (after phase47).
-- ============================================================

create policy "super_admin can create an event for a claimed organizer's week"
  on public.events for insert
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));
