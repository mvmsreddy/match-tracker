// Nudges players who declared "I'm playing" an AITA-calendar tournament to
// upload the draw sheet once it's presumably out (tournament has started)
// but no one has published one yet. Same 15-min-tick cron skeleton as
// send-reminder-emails — the cron cadence is just a clock tick, not a
// per-row schedule; this function decides per interested player whether
// they're actually due a nudge (not nudged in the last 24h).
//
// Deploy: supabase functions deploy send-aita-draw-nudges
// Reuses the SYNC_SECRET already configured for the other aita-sync
// functions (see phase45_aita_crowdsourced.sql's cron block).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');

const NUDGE_COOLDOWN_HOURS = 24;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Auth: cron secret OR super_admin JWT (same pattern as sync-aita-*) ---
  const cronHeader = req.headers.get('x-sync-secret');
  if (!(SYNC_SECRET && cronHeader === SYNC_SECRET)) {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'super_admin') return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const cooldownCutoff = new Date(Date.now() - NUDGE_COOLDOWN_HOURS * 3600 * 1000).toISOString();

  // Tournaments that have started but have no published crowdsourced draw yet.
  const { data: tournaments, error: tErr } = await admin
    .from('aita_tournaments')
    .select('id, name')
    .is('linked_event_id', null)
    .lte('start_date', todayIso);
  if (tErr) return new Response(JSON.stringify({ error: tErr.message }), { status: 500, headers: corsHeaders });
  if (!tournaments || tournaments.length === 0) {
    return new Response(JSON.stringify({ nudged: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const tournamentIds = tournaments.map((t) => t.id);
  const nameById = new Map(tournaments.map((t) => [t.id, t.name]));

  // Interested players not nudged in the last 24h (or never nudged).
  const { data: interests, error: iErr } = await admin
    .from('aita_participation_interest')
    .select('id, aita_tournament_id, user_id, last_nudged_at')
    .in('aita_tournament_id', tournamentIds)
    .eq('status', 'declared')
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${cooldownCutoff}`);
  if (iErr) return new Response(JSON.stringify({ error: iErr.message }), { status: 500, headers: corsHeaders });
  if (!interests || interests.length === 0) {
    return new Response(JSON.stringify({ nudged: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const notificationRows = interests.map((row) => {
    const name = nameById.get(row.aita_tournament_id) || 'your tournament';
    return {
      user_id: row.user_id,
      type: 'aita_draw_needed',
      title: `Draw sheet needed: ${name}`,
      body: 'No one has uploaded the draw sheet yet — upload it from your dashboard so we can track your results.',
    };
  });

  const { error: nErr } = await admin.from('notifications').insert(notificationRows);
  if (nErr) return new Response(JSON.stringify({ error: nErr.message }), { status: 500, headers: corsHeaders });

  const now = new Date().toISOString();
  await admin
    .from('aita_participation_interest')
    .update({ last_nudged_at: now })
    .in('id', interests.map((row) => row.id));

  return new Response(JSON.stringify({ nudged: interests.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
