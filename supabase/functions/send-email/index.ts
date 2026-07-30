// Generic "email arbitrary addresses" function — unlike
// send-notification-email (which resolves platform userIds to their
// account email), this is for sharing something with people who may not
// have an account at all (a coach, a parent, anyone with an email address).
// Used by the tournament share dialog (PRD §2.10); reusable by anything
// else that needs to email a raw address list.
//
// Deploy: supabase functions deploy send-email
// Reuses the RESEND_API_KEY/RESEND_FROM secrets already configured for
// send-notification-email. Requires a logged-in user (any role) — this is
// intentionally not public, to stop it being used as an open relay.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Tennis Tracker <notifications@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RECIPIENTS = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const { to, subject, html, replyTo } = await req.json();
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).slice(0, MAX_RECIPIENTS);
    if (recipients.length === 0 || !subject) {
      return new Response(JSON.stringify({ error: 'to and subject are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: recipients, subject, html: html || '', reply_to: replyTo || undefined }),
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ error: `Resend error: ${body}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, recipients: recipients.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
