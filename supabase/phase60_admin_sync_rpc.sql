-- ============================================================
-- PHASE 60 — Super-admin manual AITA sync via pg_net (RPC)
--
-- Bypasses Edge Function JWT role checks (which fail when an old
-- deployed function still expects organizer). Uses the same cron
-- secret path as phase25/phase57.
--
-- BEFORE RUNNING: replace all three placeholders below with real values
-- from Supabase Dashboard → Settings → API:
--   <SUPABASE_PROJECT_URL>      e.g. https://abcdefgh.supabase.co
--   <SUPABASE_SERVICE_ROLE_KEY> service_role key (secret)
--   <SYNC_SECRET>               same value as supabase secrets set SYNC_SECRET=...
--
-- Requires: pg_net extension, is_super_admin() from phase56.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.admin_trigger_aita_sync(p_target text default 'calendar')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base_url text := '<SUPABASE_PROJECT_URL>';
  v_secret text := '<SYNC_SECRET>';
  v_service_key text := '<SUPABASE_SERVICE_ROLE_KEY>';
  v_fn text;
  v_req bigint;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if lower(p_target) = 'all' then
    perform public.admin_trigger_aita_sync('calendar');
    perform public.admin_trigger_aita_sync('rankings');
    return jsonb_build_object('ok', true, 'target', 'all');
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
    url := v_base_url || '/functions/v1/' || v_fn,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'x-sync-secret', v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_req;

  return jsonb_build_object('ok', true, 'target', p_target, 'request_id', v_req);
end;
$$;

revoke all on function public.admin_trigger_aita_sync(text) from public;
grant execute on function public.admin_trigger_aita_sync(text) to authenticated;
