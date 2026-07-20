// Sends notification emails for a set of user ids via Resend.
// Deploy: supabase functions deploy send-notification-email
// Secret:  supabase secrets set RESEND_API_KEY=<your resend api key>
//
// user_profiles has no email column, and the anon/authenticated client can't
// read other users' auth.users.email — this function runs with the
// service-role key (auto-injected by the Edge Runtime) to resolve emails via
// the Admin API before sending.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') || 'Tennis Tracker <notifications@resend.dev>';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendOne(email: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { userIds, subject, html } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0 || !subject) {
      return new Response(JSON.stringify({ error: 'userIds and subject are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (error || !email) { failed++; continue; }
      const ok = await sendOne(email, subject, html || '');
      if (ok) sent++; else failed++;
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
