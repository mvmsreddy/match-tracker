// Weekly coach digest — ported from ACE Tracker's
// scheduler.py::_weekly_digest_tick / insights.digest_email_html
// (C:\ACETRACKING\backend\scheduler.py). Per coach with weekly_digest
// enabled, rolls up every linked player's wins/losses/sessions/streak for
// the past 7 days into one email.
//
// Simplification vs. ACE Tracker: this fires once at a single fixed weekly
// cron time (Monday 08:00 UTC, phase41_reminder_prefs.sql) rather than
// checking each coach's own local Monday-morning window — that would need
// the same 15-min-tick-with-per-user-check approach send-reminder-emails
// uses, which is a reasonable follow-up but not done here to keep this
// function's first version simple. No PDF attachment (ACE Tracker's
// version attaches one) — this links back into the app instead; wiring a
// PDF export through here is future work (see PRD §2.5 note on the
// existing jspdf usage being client-side, not straightforward to reuse
// server-side in Deno).
//
// Deploy: supabase functions deploy send-weekly-digest
// Reuses RESEND_API_KEY/RESEND_FROM and SYNC_SECRET, same as
// send-reminder-emails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Tennis Tracker <notifications@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') || 'https://www.matchtrackers.in';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

// Minimal current-streak count (no grace/freeze) — a lightweight inline
// reimplementation rather than importing src/lib/streaks.js, since Edge
// Functions bundle only supabase/functions/<name>/ at deploy time.
function currentStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (set.has(iso)) { streak++; cursor.setDate(cursor.getDate() - 1); continue; }
    if (i === 0) { cursor.setDate(cursor.getDate() - 1); continue; } // today not logged yet — don't zero it out
    break;
  }
  return streak;
}

async function sendDigest(email: string, coachName: string, rows: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: email,
      subject: 'Your weekly roster digest — Tennis Tracker',
      html: `<p>Hi ${coachName || 'Coach'},</p><p>Here's how your roster did this week:</p><table cellpadding="6">${rows}</table><p><a href="${APP_URL}/my-players">Open Coach Intelligence &rarr;</a></p>`,
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cronHeader = req.headers.get('x-sync-secret');
  if (!(SYNC_SECRET && cronHeader === SYNC_SECRET)) {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: null };
    if (!userData?.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    const { data: profile } = await admin.from('user_profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profile?.role !== 'organizer' && profile?.role !== 'coach') return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: coaches, error } = await admin.from('user_profiles').select('id, display_name').eq('weekly_digest', true).eq('role', 'coach');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0, skipped = 0, failed = 0;

  for (const coach of coaches || []) {
    try {
      const { data: links } = await admin.from('coach_player_links').select('player_id, player:user_profiles!coach_player_links_player_id_fkey(display_name)').eq('coach_id', coach.id).eq('status', 'active');
      const players = links || [];
      if (players.length === 0) { skipped++; continue; }

      const rowsHtml = (await Promise.all(players.map(async (l: any) => {
        const [matchesRes, sessionsRes] = await Promise.all([
          admin.from('matches').select('winner, match_date').eq('user_id', l.player_id).gte('match_date', cutoffIso),
          admin.from('training_sessions').select('session_date').eq('player_id', l.player_id).gte('session_date', cutoffIso),
        ]);
        const matches = matchesRes.data || [];
        const sessions = sessionsRes.data || [];
        const wins = matches.filter((m: any) => m.winner === 'self').length;
        const losses = matches.filter((m: any) => m.winner === 'opp').length;
        const streak = currentStreak([...matches.map((m: any) => m.match_date), ...sessions.map((s: any) => s.session_date)]);
        return `<tr><td>${l.player?.display_name || 'Player'}</td><td>${wins}W-${losses}L</td><td>${sessions.length} sessions</td><td>${streak}d streak</td></tr>`;
      }))).join('');

      const { data: authUser } = await admin.auth.admin.getUserById(coach.id);
      const email = authUser?.user?.email;
      if (!email) { failed++; continue; }

      const ok = await sendDigest(email, coach.display_name, rowsHtml);
      if (ok) sent++; else failed++;
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, skipped, failed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
