-- ============================================================
-- PHASE 47 — RLS fixes for admin-acting-on-behalf-of-someone-else actions
-- Extends phase45/phase46.
--
-- Three real gaps, all with the same root cause: every RLS write policy
-- added in phase45/46 assumed the person performing the write is also the
-- row's owner (auth.uid() = created_by / user_id). That's true for the
-- crowdsourced draw-publish path (the super_admin becomes the shadow
-- tournament_week's own created_by), but NOT true for the organizer-claim
-- approval path, where a super_admin creates/updates rows on behalf of a
-- DIFFERENT user (the claiming organizer). Confirmed live: approving a
-- claim failed silently/loudly at the tournament_weeks insert because RLS
-- required auth.uid() = created_by, which never holds when an admin is
-- creating the week for someone else.
--
-- 1. tournament_weeks — super_admin can insert a week with created_by set
--    to any user (approveAitaOrganizerClaim in src/api/supabaseApi.js).
-- 2. aita_tournaments — had NO update policy at all for authenticated users
--    (phase25's comment "only the service-role key... may write" predates
--    phase45/46 needing the client to set linked_tournament_week_id /
--    linked_event_id from a real super_admin session, not an Edge Function).
-- 3. notifications — the existing insert policy only covers self-
--    notifications or notifications about a tournament the SENDER created;
--    breaks both "admin notifies the organizer their claim was
--    approved/rejected" and "organizer notifies admins of a new claim".
--
-- Run in Supabase SQL Editor.
-- ============================================================

create policy "super_admin can create tournament weeks for a claimed organizer"
  on public.tournament_weeks for insert
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create policy "super_admin can update AITA tournament link columns"
  on public.aita_tournaments for update
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'))
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create policy "super_admin can send notifications to anyone"
  on public.notifications for insert
  with check (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create policy "Anyone can notify a super_admin"
  on public.notifications for insert
  with check (exists (select 1 from public.user_profiles where id = user_id and role = 'super_admin'));
