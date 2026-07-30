// Daily "you haven't logged today" reminder email — ported from ACE
// Tracker's scheduler.py::_reminder_tick / insights.reminder_email_html
// (C:\ACETRACKING\backend\scheduler.py). Runs on a 15-min pg_cron tick
// (phase41_reminder_prefs.sql) and, per user, only actually sends once
// their local reminder_time has arrived AND nothing's been logged today AND
// they haven't already been reminded today — the cron cadence is just a
// clock tick, not a per-user schedule.
//
// Deploy: supabase functions deploy send-reminder-emails
// Reuses the RESEND_API_KEY/RESEND_FROM secrets already configured for
// send-notification-email, and the SYNC_SECRET already configured for the
// AITA sync functions (see phase41_reminder_prefs.sql's cron block).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Tennis Tracker <notifications@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

function localNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hh: Number(get('hour')), mm: Number(get('minute')) };
}

async function sendOne(email: string, name: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: email,
      subject: "Log today's session — Tennis Tracker",
      html: `<p>Hi ${name || 'there'},</p><p>You haven't logged a match, training session, or nutrition entry today. A quick log now keeps your streak alive.</p>`,
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // --- Auth: cron secret OR organizer JWT (same pattern as sync-aita-*, so this can be tested manually) ---
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cronHeader = req.headers.get('x-sync-secret');
  if (!(SYNC_SECRET && cronHeader === SYNC_SECRET)) {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    if (!userData?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'organizer') return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
  }

  const { data: candidates, error } = await admin
    .from('user_profiles')
    .select('id, display_name, reminder_time, reminder_timezone, last_reminded_date')
    .eq('reminder_enabled', true);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0, skipped = 0, failed = 0;

  for (const u of candidates || []) {
    try {
      const { date: todayLocal, hh, mm } = localNow(u.reminder_timezone || 'Asia/Kolkata');
      if (u.last_reminded_date === todayLocal) { skipped++; continue; }

      const [rh, rm] = String(u.reminder_time || '18:00').split(':').map(Number);
      const nowMin = hh * 60 + mm;
      const reminderMin = rh * 60 + rm;
      // 15-min tick window: only fire once we've just crossed reminder_time.
      if (nowMin < reminderMin || nowMin >= reminderMin + 15) { skipped++; continue; }

      const [{ count: mCount }, { count: tCount }, { count: nCount }] = await Promise.all([
        admin.from('matches').select('id', { count: 'exact', head: true }).eq('user_id', u.id).eq('match_date', todayLocal),
        admin.from('training_sessions').select('id', { count: 'exact', head: true }).eq('player_id', u.id).eq('session_date', todayLocal),
        admin.from('nutrition_logs').select('id', { count: 'exact', head: true }).eq('user_id', u.id).eq('log_date', todayLocal),
      ]);
      if ((mCount || 0) + (tCount || 0) + (nCount || 0) > 0) { skipped++; continue; }

      const { data: authUser } = await admin.auth.admin.getUserById(u.id);
      const email = authUser?.user?.email;
      if (!email) { failed++; continue; }

      const ok = await sendOne(email, u.display_name);
      if (ok) {
        sent++;
        await admin.from('user_profiles').update({ last_reminded_date: todayLocal }).eq('id', u.id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, skipped, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
