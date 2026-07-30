-- ============================================================
-- PHASE 36 — Nutrition Logging
-- See docs/ace-tracker-feature-gap-prd.md §2.1 and
-- C:\Users\madhu\.claude\plans\radiant-growing-knuth.md (Phase 2, item 4).
--
-- New nutrition_logs table (meals + macros + hydration) plus three goal
-- columns on user_profiles (kcal/water/protein targets) that
-- NutritionPage.jsx's progress bars read against.
--
-- Run in Supabase SQL Editor.
-- ============================================================

alter table public.user_profiles
  add column if not exists kcal_goal        integer,
  add column if not exists water_goal_ml     integer,
  add column if not exists protein_goal_g    integer;

create table if not exists public.nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  log_date    date not null,
  meal_type   text not null,  -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_match' | 'post_match'

  food_items  text,
  calories    integer,
  protein_g   numeric,
  carbs_g     numeric,
  fats_g      numeric,
  hydration_ml integer,
  notes       text
);

alter table public.nutrition_logs enable row level security;

create policy "Users can view their own nutrition logs"
  on public.nutrition_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own nutrition logs"
  on public.nutrition_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own nutrition logs"
  on public.nutrition_logs for delete
  using (auth.uid() = user_id);

-- Same cross-user read pattern as matches/training_sessions (phase30) — a
-- linked coach can see a player's nutrition adherence, not edit it (PRD
-- §5.3's permission matrix: Coach = R on nutrition logs, not RW).
create policy "Linked coaches can view a player's nutrition logs"
  on public.nutrition_logs for select
  using (
    exists (
      select 1 from public.coach_player_links l
      where l.player_id = nutrition_logs.user_id
        and l.coach_id = auth.uid()
        and l.status = 'active'
    )
  );

-- Parents get read access too (PRD §5.3: Parent = RW on nutrition — but this
-- app has no parent-write nutrition UI yet, so read-only for now; widen to
-- RW if/when a parent-side nutrition entry flow is built).
create policy "Linked parents can view a player's nutrition logs"
  on public.nutrition_logs for select
  using (
    exists (
      select 1 from public.parent_player_links l
      where l.player_id = nutrition_logs.user_id
        and l.parent_id = auth.uid()
        and l.status = 'active'
    )
  );

create index if not exists nutrition_logs_user_date_idx
  on public.nutrition_logs (user_id, log_date desc);
