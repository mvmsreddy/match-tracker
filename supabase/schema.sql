-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).
-- Creates the "matches" table that stores every completed match/practice session
-- in full (all points + header info), scoped per logged-in user via Row Level Security.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  self_name text not null,
  opp_name text not null,
  tournament text,
  match_date date,
  session_type text not null,          -- 'match' | 'practice'
  format_preset text,
  format_label text,
  point_target integer,
  surface text,
  indoor_outdoor text,
  opp_handedness text,
  weather text,
  notes text,

  score_summary text,                  -- e.g. "6-4, 4-6, [10-7]"
  winner text,                         -- 'self' | 'opp' | null (in progress)
  point_count integer,
  match_duration_ms bigint,

  -- Full point-by-point log + final engine state, so the Detail page can
  -- reconstruct every stat exactly like the live view, forever.
  points jsonb not null,
  sets jsonb
);

-- Row Level Security: each user can only ever see/modify their own matches.
alter table public.matches enable row level security;

create policy "Users can view their own matches"
  on public.matches for select
  using (auth.uid() = user_id);

create policy "Users can insert their own matches"
  on public.matches for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own matches"
  on public.matches for delete
  using (auth.uid() = user_id);

create index if not exists matches_user_id_created_at_idx
  on public.matches (user_id, created_at desc);
