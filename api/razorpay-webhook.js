import crypto from 'node:crypto';
import { createServiceClient } from './_supabaseServer.js';

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Server-to-server safety net alongside razorpay-verify.js: if the player's
// browser closes right after paying (flaky network, app switch), this still
// marks the payment 'paid' from Razorpay's own callback, so the money is
// never silently unaccounted for. It intentionally does NOT create the
// draw_entries row (no user session/auth.uid() is available in a webhook)
// — TournamentDetailPage.jsx surfaces a "finish confirming your paid entry"
// affordance the next time the player is in an authenticated session, which
// calls the same api.finalizePaidEntry(paymentId) the happy path uses.
//
// Needs the raw request body (not the parsed JSON) to verify the signature.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!RAZORPAY_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Webhook is not configured.' });
    return;
  }

  const raw = await readRawBody(req);
  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  if (!signature || expected !== signature) {
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const supabase = createServiceClient();
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured on the server.' });
    return;
  }

  try {
    const payment = event.payload?.payment?.entity;
    if (event.event === 'payment.captured' && payment?.order_id) {
      const { error } = await supabase
        .from('event_payments')
        .update({ status: 'paid', razorpay_payment_id: payment.id, updated_at: new Date().toISOString() })
        .eq('razorpay_order_id', payment.order_id)
        .eq('status', 'created');
      if (error) throw new Error(error.message);
    } else if (event.event === 'payment.failed' && payment?.order_id) {
      const { error } = await supabase
        .from('event_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('razorpay_order_id', payment.order_id)
        .eq('status', 'created');
      if (error) throw new Error(error.message);
    }
    // Other event types are ignored — 200 so Razorpay doesn't retry them.
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('razorpay-webhook error', err);
    // Non-2xx so Razorpay retries with backoff — this is a transient DB
    // error, not a signature/data problem, and self-healing on retry is the
    // whole point of this endpoint existing.
    res.status(500).json({ error: 'Could not process webhook' });
  }
}
