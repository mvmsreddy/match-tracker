-- Phase 23: Player gender on user_profiles
-- Run this in Supabase SQL Editor AFTER phase1_profiles_schema.sql
--
-- Self-entry had no way to validate a player against the gender of the
-- event category they're entering (Boys/Girls/Men/Women Singles/Doubles) —
-- aita_players (the read-only rankings lookup) has always had gender, but
-- a platform user's own profile never did. Mixed Doubles is exempt from the
-- check entirely (the check applies to gendered categories only).

alter table public.user_profiles
  add column if not exists gender text;  -- 'M' | 'F' | null (unset — not yet validated)
