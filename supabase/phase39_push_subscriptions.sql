-- ============================================================
-- PHASE 39 — Web Push Subscriptions
-- See docs/ace-tracker-feature-gap-prd.md §2.3 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 3, item 7).
--
-- One row per browser/device push subscription. `endpoint` is unique per
-- device (the browser's push service URL), so re-subscribing the same
-- device (e.g. after clearing the toggle off/on) upserts rather than
-- accumulating duplicates.
--
-- Requires a VAPID keypair as Supabase secrets (VAPID_PUBLIC_KEY,
-- VAPID_PRIVATE_KEY) for supabase/functions/send-push — see that
-- function's header comment for how to generate one.
--
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null  -- { p256dh, auth } — the two fields PushSubscription.toJSON() returns
);

alter table public.push_subscriptions enable row level security;

create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can create their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own push subscriptions"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);
