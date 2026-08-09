-- Phase 59 — Public player profiles, privacy tiers, play discovery
-- Run after phase58_multi_format.sql

-- ---------------------------------------------------------------------------
-- 1. Profile sharing columns
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists profile_slug text,
  add column if not exists profile_share_token uuid not null default gen_random_uuid(),
  add column if not exists profile_visibility text not null default 'private',
  add column if not exists public_bio text,
  add column if not exists privacy_settings jsonb not null default '{
    "showRanking": true,
    "showWinRate": true,
    "showTournamentCount": true,
    "showTitles": true,
    "showClub": true,
    "showCity": true,
    "showBio": true,
    "showTrackerRating": true,
    "showAvailability": true,
    "showPlaysHand": true,
    "showEquipment": false
  }'::jsonb;

alter table public.user_profiles
  drop constraint if exists user_profiles_profile_visibility_chk;

alter table public.user_profiles
  add constraint user_profiles_profile_visibility_chk
  check (profile_visibility in ('private', 'link', 'public'));

create unique index if not exists user_profiles_profile_slug_uq
  on public.user_profiles (lower(profile_slug))
  where profile_slug is not null and profile_slug <> '';

create unique index if not exists user_profiles_share_token_uq
  on public.user_profiles (profile_share_token);

-- ---------------------------------------------------------------------------
-- 2. Play availability posts ("Interested to participate")
-- ---------------------------------------------------------------------------
create table if not exists public.play_availability_posts (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.user_profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  status        text not null default 'active',
  area          text,
  city          text,
  surface       text,
  format        text,
  time_window   text,
  notes         text,
  constraint play_availability_posts_status_chk check (status in ('active', 'expired', 'cancelled'))
);

create index if not exists play_availability_posts_player_idx
  on public.play_availability_posts (player_id, status, expires_at desc);

alter table public.play_availability_posts enable row level security;

create policy "Owner manages availability posts"
  on public.play_availability_posts for all
  using (auth.uid() = player_id);

create policy "Anyone can read active availability"
  on public.play_availability_posts for select
  using (status = 'active' and expires_at > now());

-- ---------------------------------------------------------------------------
-- 3. Connect requests (in-app, no phone leak)
-- ---------------------------------------------------------------------------
create table if not exists public.play_connect_requests (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references public.user_profiles(id) on delete cascade,
  to_user_id    uuid not null references public.user_profiles(id) on delete cascade,
  message       text,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint play_connect_requests_status_chk check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint play_connect_requests_no_self_chk check (from_user_id <> to_user_id)
);

create index if not exists play_connect_requests_to_idx
  on public.play_connect_requests (to_user_id, status, created_at desc);

alter table public.play_connect_requests enable row level security;

create policy "Users see their connect requests"
  on public.play_connect_requests for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users create connect requests"
  on public.play_connect_requests for insert
  with check (auth.uid() = from_user_id);

create policy "Recipient or sender updates connect request"
  on public.play_connect_requests for update
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- ---------------------------------------------------------------------------
-- 4. Aggregate stats (security definer — no opponent/score leak)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_profile_stats(p_user_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'matchesTracked', coalesce(count(*) filter (where coalesce(point_count, 0) > 0), 0),
    'wins', coalesce(count(*) filter (where winner = 'self'), 0),
    'losses', coalesce(count(*) filter (where winner = 'opp'), 0),
    'winRate', case
      when count(*) filter (where winner in ('self', 'opp')) > 0 then
        round(100.0 * count(*) filter (where winner = 'self')
          / count(*) filter (where winner in ('self', 'opp')))
      else null
    end,
    'titles', coalesce(count(*) filter (where winner = 'self' and session_type = 'match'), 0),
    'tournaments', coalesce((
      select count(distinct tournament)
      from public.matches m2
      where m2.user_id = p_user_id
        and m2.session_type = 'match'
        and m2.tournament is not null
        and btrim(m2.tournament) <> ''
    ), 0)
  )
  from public.matches
  where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Public profile fetch by slug or share token
-- ---------------------------------------------------------------------------
create or replace function public.build_public_profile_payload(v_profile public.user_profiles)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_settings jsonb;
  v_stats jsonb;
  v_highlights jsonb;
  v_rating record;
  v_avail jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  v_settings := coalesce(v_profile.privacy_settings, '{}'::jsonb);
  v_stats := public.get_public_profile_stats(v_profile.id);

  select coalesce(jsonb_agg(row order by (row->>'date') desc nulls last), '[]'::jsonb)
  into v_highlights
  from (
    select jsonb_build_object(
      'label', coalesce(nullif(btrim(tournament), ''), 'Match win'),
      'date', match_date
    ) as row
    from public.matches
    where user_id = v_profile.id
      and winner = 'self'
      and session_type = 'match'
    order by match_date desc nulls last
    limit 5
  ) sub;

  select rating, rd into v_rating
  from public.player_ratings
  where player_id = v_profile.id and format = 'singles'
  limit 1;

  if coalesce(v_settings->>'showAvailability', 'true') = 'true' then
    select to_jsonb(p.*) into v_avail
    from public.play_availability_posts p
    where p.player_id = v_profile.id
      and p.status = 'active'
      and p.expires_at > now()
    order by p.created_at desc
    limit 1;
  end if;

  v_result := v_result || jsonb_build_object(
    'id', v_profile.id,
    'displayName', v_profile.display_name,
    'profileSlug', v_profile.profile_slug,
    'visibility', v_profile.profile_visibility
  );

  if coalesce(v_settings->>'showCity', 'true') = 'true' then
    v_result := v_result || jsonb_build_object(
      'city', v_profile.city,
      'stateAbbr', v_profile.state_abbr
    );
  end if;

  if coalesce(v_settings->>'showClub', 'true') = 'true' then
    v_result := v_result || jsonb_build_object('clubName', v_profile.club_name);
  end if;

  if coalesce(v_settings->>'showBio', 'true') = 'true' then
    v_result := v_result || jsonb_build_object(
      'publicBio', coalesce(nullif(btrim(v_profile.public_bio), ''), v_profile.bio)
    );
  end if;

  if coalesce(v_settings->>'showRanking', 'true') = 'true' then
    v_result := v_result || jsonb_build_object('ranking', v_profile.ranking);
  end if;

  if coalesce(v_settings->>'showPlaysHand', 'true') = 'true' then
    v_result := v_result || jsonb_build_object('plays', v_profile.plays);
  end if;

  if coalesce(v_settings->>'showWinRate', 'true') = 'true'
     or coalesce(v_settings->>'showTournamentCount', 'true') = 'true'
     or coalesce(v_settings->>'showTitles', 'true') = 'true' then
    v_result := v_result || jsonb_build_object(
      'stats', jsonb_build_object(
        'matchesTracked', case when coalesce(v_settings->>'showWinRate', 'true') = 'true' then v_stats->'matchesTracked' else null end,
        'wins', case when coalesce(v_settings->>'showTitles', 'true') = 'true' then v_stats->'wins' else null end,
        'winRate', case when coalesce(v_settings->>'showWinRate', 'true') = 'true' then v_stats->'winRate' else null end,
        'titles', case when coalesce(v_settings->>'showTitles', 'true') = 'true' then v_stats->'titles' else null end,
        'tournaments', case when coalesce(v_settings->>'showTournamentCount', 'true') = 'true' then v_stats->'tournaments' else null end
      )
    );
  end if;

  if coalesce(v_settings->>'showTrackerRating', 'true') = 'true' and v_rating.rating is not null then
    v_result := v_result || jsonb_build_object(
      'trackerRating', round(v_rating.rating::numeric, 0)
    );
  end if;

  v_result := v_result || jsonb_build_object(
    'highlights', case when coalesce(v_settings->>'showTitles', 'true') = 'true' then v_highlights else '[]'::jsonb end,
    'availability', v_avail
  );

  return v_result;
end;
$$;

create or replace function public.get_public_profile_by_slug(p_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
begin
  select * into v_profile
  from public.user_profiles
  where lower(profile_slug) = lower(trim(p_slug))
    and profile_visibility in ('public', 'link');

  if not found then
    return null;
  end if;

  return public.build_public_profile_payload(v_profile);
end;
$$;

create or replace function public.get_public_profile_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
begin
  select * into v_profile
  from public.user_profiles
  where profile_share_token = p_token
    and profile_visibility = 'link';

  if not found then
    return null;
  end if;

  return public.build_public_profile_payload(v_profile);
end;
$$;

grant execute on function public.get_public_profile_stats(uuid) to authenticated;
grant execute on function public.get_public_profile_by_slug(text) to anon, authenticated;
grant execute on function public.get_public_profile_by_token(uuid) to anon, authenticated;

-- Anonymous read for fully public profiles (minimal fields — prefer RPC)
create policy "Anonymous can read public profiles"
  on public.user_profiles for select
  to anon
  using (profile_visibility = 'public');
