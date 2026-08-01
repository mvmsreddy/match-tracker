import crypto from 'node:crypto';
import { createServiceClient } from './_supabaseServer.js';

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Verifies the signature Razorpay Checkout hands back to the browser on a
// successful payment, then flips event_payments to 'paid'. This is the
// primary (browser-driven) confirmation path; razorpay-webhook.js is the
// server-to-server safety net for the case where the browser never gets to
// call this (tab closed right after paying). Either path uses the same
// idempotent 'created' -> 'paid' transition, so whichever fires first wins
// and the other becomes a no-op.
//
// This endpoint deliberately does NOT create the draw_entries row — that
// still happens client-side via api.finalizePaidEntry(paymentId), reusing
// the exact same placement logic (computeSelfEntryPlacement +
// apply_self_entry_placement) that free self-entry already uses, under the
// player's own session/RLS. Keeping that logic in one place (the browser)
// avoids maintaining two copies of the cascading-placement algorithm.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!RAZORPAY_KEY_SECRET) {
    res.status(503).json({ error: 'Payments are not configured yet.' });
    return;
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: 'Missing payment fields' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expected !== razorpay_signature) {
    res.status(400).json({ error: 'Payment signature verification failed' });
    return;
  }

  const supabase = createServiceClient();
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured on the server.' });
    return;
  }

  try {
    const { data: updated, error } = await supabase
      .from('event_payments')
      .update({
        status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('status', 'created')
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);

    let paymentId = updated?.id;
    if (!paymentId) {
      // Already transitioned (webhook got there first, or this is a retry).
      const { data: existing, error: fetchErr } = await supabase
        .from('event_payments')
        .select('id, status')
        .eq('razorpay_order_id', razorpay_order_id)
        .single();
      if (fetchErr || !existing) throw new Error('Payment record not found');
      if (existing.status !== 'paid') throw new Error(`Payment is ${existing.status}, not paid`);
      paymentId = existing.id;
    }

    res.status(200).json({ ok: true, paymentId });
  } catch (err) {
    console.error('razorpay-verify error', err);
    res.status(400).json({ error: err.message || 'Could not verify payment' });
  }
}
