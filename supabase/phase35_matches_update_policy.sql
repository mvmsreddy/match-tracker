-- ============================================================
-- PHASE 35 — Matches: owner UPDATE policy
-- See docs/ace-tracker-feature-gap-prd.md and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 1, item 2).
--
-- schema.sql only ever granted select/insert/delete on public.matches — no
-- update policy exists (confirmed by grepping every supabase/*.sql for
-- "on public.matches for"). Retroactive point-by-point entry
-- (RetroactivePointEntryModal.jsx, via api.updateMatchPoints) needs the
-- owner to be able to append points to an already-saved match, so this adds
-- exactly that: an owner-only update policy, matching the existing
-- owner-only insert/delete policies in shape.
--
-- Run in Supabase SQL Editor.
-- ============================================================

drop policy if exists "Users can update their own matches" on public.matches;
create policy "Users can update their own matches"
  on public.matches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
