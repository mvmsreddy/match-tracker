-- ============================================================
-- PHASE 1b — Add role_confirmed flag to user_profiles
-- Run this in Supabase SQL Editor AFTER phase1_profiles_schema.sql
-- ============================================================

-- Add the flag (false = role not yet explicitly chosen by the user)
alter table public.user_profiles
  add column if not exists role_confirmed boolean not null default false;

-- Update the trigger so email-signup users get role_confirmed = true
-- (they explicitly picked their role in the signup form).
-- Google OAuth users get role_confirmed = false (default) and will
-- be shown the role picker on first login.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
  v_confirmed boolean;
begin
  v_role      := coalesce(new.raw_user_meta_data->>'role', 'player');
  -- If role was explicitly passed in metadata (email signup), mark confirmed.
  -- Google OAuth never sets this metadata key, so it stays false.
  v_confirmed := (new.raw_user_meta_data->>'role') is not null;

  insert into public.user_profiles (id, display_name, role, role_confirmed)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    v_confirmed
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Existing users who already have a role set: mark them as confirmed
-- so they don't get the picker on next login.
update public.user_profiles
  set role_confirmed = true
  where role is not null and role != '';
