-- ============================================================
-- PHASE 56 — Signup approval governance
-- Player + organizer signups require super_admin approval before
-- the account becomes active. Existing users are backfilled to active.
-- Run AFTER phase1b_role_confirmed.sql
-- ============================================================

alter table public.user_profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists aita_match_verified boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists rejection_reason text;

alter table public.user_profiles
  drop constraint if exists user_profiles_account_status_check;

alter table public.user_profiles
  add constraint user_profiles_account_status_check
  check (account_status in ('active', 'pending', 'rejected'));

-- Backfill — every existing row stays usable
update public.user_profiles set account_status = 'active' where account_status is null or account_status = '';

create index if not exists user_profiles_account_status_idx
  on public.user_profiles (account_status)
  where account_status = 'pending';

-- New signups: player + organizer start pending; other roles active immediately.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
  v_confirmed boolean;
  v_status text;
begin
  v_role      := coalesce(new.raw_user_meta_data->>'role', 'player');
  v_confirmed := (new.raw_user_meta_data->>'role') is not null;
  v_status    := case
    when v_role in ('player', 'organizer') then 'pending'
    else 'active'
  end;

  insert into public.user_profiles (id, display_name, role, role_confirmed, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    v_confirmed,
    v_status
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- Super-admin helpers (security definer — bypass RLS for approval actions)
-- ---------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.approve_user_signup(
  p_user_id uuid,
  p_set_verified boolean default false,
  p_aita_match_verified boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;

  update public.user_profiles
  set account_status = 'active',
      approved_at = now(),
      approved_by = auth.uid(),
      rejection_reason = null,
      is_verified = case when p_set_verified then true else is_verified end,
      aita_match_verified = coalesce(p_aita_match_verified, aita_match_verified),
      updated_at = now()
  where id = p_user_id
    and account_status = 'pending';
end;
$$;

create or replace function public.reject_user_signup(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;

  update public.user_profiles
  set account_status = 'rejected',
      rejection_reason = nullif(trim(p_reason), ''),
      approved_at = null,
      approved_by = auth.uid(),
      updated_at = now()
  where id = p_user_id
    and account_status = 'pending';
end;
$$;

grant execute on function public.approve_user_signup(uuid, boolean, boolean) to authenticated;
grant execute on function public.reject_user_signup(uuid, text) to authenticated;
