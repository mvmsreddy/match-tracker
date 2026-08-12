-- ============================================================
-- PHASE 60 — Super-admin manual AITA sync via pg_net (RPC)
--
-- Bypasses outdated Edge Function JWT checks. Uses the cron
-- secret path (x-sync-secret) — same as phase25/phase57.
--
-- SETUP (SQL Editor, two steps):
--   1. Run this whole file (creates table + RPC).
--   2. Run the INSERT at the bottom — replace the 3 values.
--
-- Requires: pg_net, is_super_admin() from phase56.
-- ============================================================

create extension if not exists pg_net;

-- One-row config — only readable by the security-definer RPC below.
create table if not exists public.platform_sync_config (
  id int primary key default 1 check (id = 1),
  supabase_url text not null,
  service_role_key text not null,
  sync_secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_sync_config enable row level security;
-- No SELECT/INSERT policies — only postgres / SQL Editor can write;
-- the RPC reads via security definer.

create or replace function public.admin_trigger_aita_sync(p_target text default 'calendar')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg public.platform_sync_config%rowtype;
  v_fn text;
  v_req bigint;
begin
  -- App calls (authenticated JWT): must be super_admin in user_profiles.
  -- SQL Editor runs as postgres with auth.uid() null — allow for setup testing.
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_cfg from public.platform_sync_config where id = 1;
  if not found then
    raise exception 'Sync not configured — run the INSERT block at the bottom of phase60_admin_sync_rpc.sql';
  end if;

  if lower(p_target) = 'all' then
    select net.http_post(
      url := rtrim(v_cfg.supabase_url, '/') || '/functions/v1/sync-aita-calendar',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_cfg.service_role_key,
        'x-sync-secret', v_cfg.sync_secret,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) into v_req;
    perform net.http_post(
      url := rtrim(v_cfg.supabase_url, '/') || '/functions/v1/sync-aita-rankings',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_cfg.service_role_key,
        'x-sync-secret', v_cfg.sync_secret,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    return jsonb_build_object('ok', true, 'target', 'all', 'calendar_request_id', v_req);
  end if;

  v_fn := case lower(p_target)
    when 'calendar' then 'sync-aita-calendar'
    when 'rankings' then 'sync-aita-rankings'
    else null
  end;

  if v_fn is null then
    raise exception 'Unknown sync target: % (use calendar, rankings, or all)', p_target;
  end if;

  select net.http_post(
    url := rtrim(v_cfg.supabase_url, '/') || '/functions/v1/' || v_fn,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_cfg.service_role_key,
      'x-sync-secret', v_cfg.sync_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_req;

  return jsonb_build_object('ok', true, 'target', p_target, 'request_id', v_req);
end;
$$;

revoke all on function public.admin_trigger_aita_sync(text) from public;
grant execute on function public.admin_trigger_aita_sync(text) to authenticated;

-- Read pg_net response for a queued sync (helps diagnose 404 / auth failures).
create or replace function public.admin_check_sync_request(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row net._http_response%rowtype;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_row from net._http_response where id = p_request_id;
  if not found then
    return jsonb_build_object('pending', true, 'request_id', p_request_id);
  end if;

  return jsonb_build_object(
    'pending', false,
    'request_id', p_request_id,
    'status_code', v_row.status_code,
    'error_msg', v_row.error_msg,
    'content', left(coalesce(v_row.content, ''), 500)
  );
end;
$$;

revoke all on function public.admin_check_sync_request(bigint) from public;
grant execute on function public.admin_check_sync_request(bigint) to authenticated;

-- ============================================================
-- STEP 2 — Run this separately AFTER step 1 (replace 3 values):
--
--   supabase_url       → Dashboard → Settings → API → Project URL
--   service_role_key   → Dashboard → Settings → API → service_role (secret)
--   sync_secret        → Edge Functions secret SYNC_SECRET (or pick any new random string
--                        and set it: npx supabase secrets set SYNC_SECRET=...)
-- ============================================================
--
-- insert into public.platform_sync_config (supabase_url, service_role_key, sync_secret)
-- values (
--   'https://YOUR_PROJECT_REF.supabase.co',
--   'YOUR_SERVICE_ROLE_KEY',
--   'YOUR_SYNC_SECRET'
-- )
-- on conflict (id) do update set
--   supabase_url = excluded.supabase_url,
--   service_role_key = excluded.service_role_key,
--   sync_secret = excluded.sync_secret,
--   updated_at = now();
