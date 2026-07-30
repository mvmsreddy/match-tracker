-- ============================================================
-- PHASE 42 — Video on Training Logs
-- See docs/ace-tracker-feature-gap-prd.md §2.9 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 4, item 11).
--
-- New PRIVATE Storage bucket (unlike the existing public aita-factsheets
-- bucket — see phase25_aita_calendar.sql — this one holds direct user
-- uploads, so it needs real insert/select/delete policies, not just a
-- select-only policy backed by service-role writes). Files are uploaded to
-- `<player_id>/<filename>` so bucket-wide RLS can key off the folder name
-- exactly like every other cross-user policy in this schema keys off a
-- foreign-key column.
--
-- Run in Supabase SQL Editor.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('training-videos', 'training-videos', false)
on conflict (id) do nothing;

create policy "Owner can upload their own training videos"
  on storage.objects for insert
  with check (bucket_id = 'training-videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner or linked coach/parent can view training videos"
  on storage.objects for select
  using (
    bucket_id = 'training-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.coach_player_links l
        where l.player_id::text = (storage.foldername(name))[1]
          and l.coach_id = auth.uid() and l.status = 'active'
      )
      or exists (
        select 1 from public.parent_player_links l
        where l.player_id::text = (storage.foldername(name))[1]
          and l.parent_id = auth.uid() and l.status = 'active'
      )
    )
  );

create policy "Owner can delete their own training videos"
  on storage.objects for delete
  using (bucket_id = 'training-videos' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.training_sessions
  add column if not exists video_path      text,
  add column if not exists thumbnail_path  text,
  add column if not exists duration_sec    integer;
