// Sends Web Push notifications for a set of user ids, using every stored
// subscription per user (a user can have several — one per device/browser).
// Mirrors send-notification-email/index.ts's shape/auth model exactly (no
// role gate — same low-friction internal-trust pattern already used for
// notification emails in this codebase).
//
// Deploy: supabase functions deploy send-push
// Secrets (generate a keypair with `npx web-push generate-vapid-keys`, or
// any VAPID generator — Web Push requires a P-256 EC keypair):
//   supabase secrets set VAPID_PUBLIC_KEY=<public key>
//   supabase secrets set VAPID_PRIVATE_KEY=<private key>
//   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
// VITE_VAPID_PUBLIC_KEY (frontend .env, same public key value) is what
// src/lib/push.js gives the browser's Push API when subscribing.
//
// Dead subscriptions (browser unsubscribed, or the push service returns
// 404/410 Gone) are deleted here rather than left to accumulate and fail
// silently forever.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@example.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const { userIds, title, body, link } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0 || !title) {
      return new Response(JSON.stringify({ error: 'userIds and title are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error: subErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, keys')
      .in('user_id', userIds);
    if (subErr) throw subErr;

    const payload = JSON.stringify({ title, body: body || '', link: link || '/' });

    let sent = 0;
    let failed = 0;
    const deadIds: string[] = [];

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
        sent++;
      } catch (err) {
        failed++;
        const status = err?.statusCode;
        if (status === 404 || status === 410) deadIds.push(sub.id);
      }
    }

    if (deadIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', deadIds);
    }

    return new Response(JSON.stringify({ sent, failed, removed: deadIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
