-- ============================================================
-- PHASE 45 — Crowdsourced AITA Tournament Participation
-- See C:\Users\madhu\.claude\plans\piped-juggling-dove.md
--
-- Lets a player declare "I'm playing" an AITA-calendar tournament, upload
-- the draw sheet / daily results as photos or PDFs (since aitatennis.com
-- isn't ours to integrate with), and have a super_admin review before any
-- of it goes live. Once a draw is published it becomes a REAL
-- tournament_weeks/events/draw_entries/event_matches record — same tables
-- phase2_schema.sql already defined for organizer-run events — so the
-- existing bracket UI, player dashboard, and match-tracker linking all work
-- unmodified. See published-row RLS note below for why this table set
-- needs no special "organizer or super_admin" clauses of its own.
--
-- Run in Supabase SQL Editor. Then:
--   1. Manually set your test admin's role: update public.user_profiles
--      set role = 'super_admin' where id = '<their auth.users id>';
--      (role is free text already — see phase33_parent_role.sql — no new
--      role enum/constraint exists to update.)
--   2. supabase functions deploy send-aita-draw-nudges (once built)
--   3. Replace <SUPABASE_PROJECT_URL>, <SYNC_SECRET> and
--      <SUPABASE_SERVICE_ROLE_KEY> below with real values (reuse the same
--      SYNC_SECRET already configured for the other aita-sync functions).
-- ============================================================

-- ----------------------------------------------------------
-- 1. Link columns on aita_tournaments — set once a crowdsourced draw is
--    published, so the sync/nudge logic can tell "already has a live
--    shadow event" from "still just a calendar listing".
-- ----------------------------------------------------------
alter table public.aita_tournaments
  add column if not exists linked_tournament_week_id uuid references public.tournament_weeks(id) on delete set null,
  add column if not exists linked_event_id            uuid references public.events(id) on delete set null;

-- ----------------------------------------------------------
-- 2. tournament_weeks gets a `source` tag so crowdsourced shadow weeks can
--    be told apart from organizer-created ones (e.g. for UI labeling).
--    `created_by` is set to the reviewing super_admin's own auth.uid() at
--    publish time (see the app-side publish flow) rather than left null —
--    created_by is NOT NULL and every existing RLS policy on events/
--    draw_entries/event_matches keys off it, so making the super_admin the
--    row's "organizer" means all of that machinery works with zero new
--    policies here.
-- ----------------------------------------------------------
alter table public.tournament_weeks
  add column if not exists source text not null default 'organiser';  -- 'organiser' | 'aita_crowdsourced'

-- ----------------------------------------------------------
-- 3. aita_participation_interest — a player saying "I'm playing this".
--    Deliberately NOT a draw_entries row: no real event/draw exists yet at
--    this point, and this keeps the existing self-entry RLS/logic
--    (entry_source 'organiser'|'player', phase14) untouched.
-- ----------------------------------------------------------
create table if not exists public.aita_participation_interest (
  id                  uuid primary key default gen_random_uuid(),
  aita_tournament_id  uuid not null references public.aita_tournaments(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'declared',  -- 'declared' | 'withdrawn'
  created_at          timestamptz not null default now(),
  last_nudged_at      timestamptz,

  unique (aita_tournament_id, user_id)
);

alter table public.aita_participation_interest enable row level security;

create policy "Player views own interest, super_admin views all"
  on public.aita_participation_interest for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
  );

create policy "Player declares their own interest"
  on public.aita_participation_interest for insert
  with check (auth.uid() = user_id);

create policy "Player updates their own interest (e.g. withdraw)"
  on public.aita_participation_interest for update
  using (auth.uid() = user_id);

create index if not exists aita_participation_interest_tournament_idx
  on public.aita_participation_interest (aita_tournament_id, status);

create index if not exists aita_participation_interest_user_idx
  on public.aita_participation_interest (user_id);

-- ----------------------------------------------------------
-- 4. aita_draw_uploads — one row per uploaded draw-sheet photo/PDF.
--    status lifecycle: 'pending_review' (just uploaded) -> 'confirmed'
--    (admin confirms it's the right tournament) or 'confirmed_wrong'
--    (admin says it isn't) -> 'parsed' (auto-parse ran on a confirmed
--    upload) -> 'published' (admin approved the parsed entries and the
--    shadow tournament_week/event now exists).
-- ----------------------------------------------------------
create table if not exists public.aita_draw_uploads (
  id                  uuid primary key default gen_random_uuid(),
  aita_tournament_id  uuid not null references public.aita_tournaments(id) on delete cascade,
  uploaded_by         uuid not null references auth.users(id) on delete cascade,
  storage_path        text not null,
  uploaded_at         timestamptz not null default now(),
  status              text not null default 'pending_review',
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  parsed_json         jsonb,
  published_event_id  uuid references public.events(id) on delete set null
);

alter table public.aita_draw_uploads enable row level security;

create policy "Uploader or super_admin can view draw uploads"
  on public.aita_draw_uploads for select
  using (
    auth.uid() = uploaded_by
    or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
  );

create policy "Player can upload a draw sheet"
  on public.aita_draw_uploads for insert
  with check (auth.uid() = uploaded_by);

create policy "Only super_admin reviews draw uploads"
  on public.aita_draw_uploads for update
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create index if not exists aita_draw_uploads_tournament_idx
  on public.aita_draw_uploads (aita_tournament_id, status);

-- ----------------------------------------------------------
-- 5. aita_results_uploads — one row per EOD results-sheet photo/PDF.
--    Always requires super_admin approval before Apply — no auto-publish,
--    unlike the draw-sheet flow's lighter single-confirm gate.
-- ----------------------------------------------------------
create table if not exists public.aita_results_uploads (
  id                  uuid primary key default gen_random_uuid(),
  aita_tournament_id  uuid not null references public.aita_tournaments(id) on delete cascade,
  event_id            uuid not null references public.events(id) on delete cascade,
  uploaded_by         uuid not null references auth.users(id) on delete cascade,
  storage_path        text not null,
  uploaded_at         timestamptz not null default now(),
  status              text not null default 'pending_review',  -- 'pending_review' | 'rejected' | 'applied'
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  parsed_json         jsonb,
  applied_at          timestamptz
);

alter table public.aita_results_uploads enable row level security;

create policy "Uploader or super_admin can view results uploads"
  on public.aita_results_uploads for select
  using (
    auth.uid() = uploaded_by
    or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
  );

-- Only a player who is actually in that event's published draw may upload
-- results for it (keeps this open to "any of the 64", not just the
-- original interest-declarers, while still excluding uninvolved players).
create policy "Player in the draw can upload a results sheet"
  on public.aita_results_uploads for insert
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.draw_entries de
      where de.event_id = aita_results_uploads.event_id and de.player_id = auth.uid()
    )
  );

create policy "Only super_admin reviews results uploads"
  on public.aita_results_uploads for update
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin'));

create index if not exists aita_results_uploads_event_idx
  on public.aita_results_uploads (event_id, status);

-- ----------------------------------------------------------
-- 6. Storage buckets — private, same pattern as phase42's training-videos
--    bucket: path is <uploader_uid>/<filename>, RLS keys off the first
--    path segment, plus a super_admin read-all policy for the review queue.
-- ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('aita-draw-uploads', 'aita-draw-uploads', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('aita-results-uploads', 'aita-results-uploads', false)
on conflict (id) do nothing;

create policy "Owner can upload their own AITA draw sheet"
  on storage.objects for insert
  with check (bucket_id = 'aita-draw-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner or super_admin can view AITA draw sheet uploads"
  on storage.objects for select
  using (
    bucket_id = 'aita-draw-uploads'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
    )
  );

create policy "Owner can upload their own AITA results sheet"
  on storage.objects for insert
  with check (bucket_id = 'aita-results-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner or super_admin can view AITA results sheet uploads"
  on storage.objects for select
  using (
    bucket_id = 'aita-results-uploads'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'super_admin')
    )
  );

-- ----------------------------------------------------------
-- 7. Nudge cron — every 15 min tick, same skeleton as phase41's
--    send-reminder-emails (per-row idempotency via last_nudged_at, not a
--    per-user schedule). The function itself only sends once a day per
--    interested player, for tournaments past start_date with no
--    linked_event_id yet. Deploy the function BEFORE running this block,
--    or re-run just this block afterward (cron.schedule upserts by name).
-- ----------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-aita-draw-nudges',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := '<SUPABASE_PROJECT_URL>/functions/v1/send-aita-draw-nudges',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
      'x-sync-secret', '<SYNC_SECRET>',
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
