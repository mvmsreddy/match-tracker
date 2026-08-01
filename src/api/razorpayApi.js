import { supabase } from '../lib/supabaseClient';

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not logged in');
  return { Authorization: `Bearer ${session.access_token}` };
}

// Returns { requiresPayment: false } for free events (fee unset/zero) so the
// caller can fall straight through to the existing free selfEnterSingles
// flow untouched. Returns { requiresPayment: true, orderId, amount, keyId,
// paymentId, prefill } otherwise.
export async function createEntryOrder(eventId) {
  const headers = await authHeader();
  const res = await fetch('/api/razorpay-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ eventId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Could not start payment');
  return body;
}

// Verifies the Razorpay Checkout response server-side and flips the payment
// row to 'paid'. Does not create the draw_entries row — call
// api.finalizePaidEntry(paymentId) next (see src/api/supabaseApi.js).
export async function verifyEntryPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const res = await fetch('/api/razorpay-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Could not verify payment');
  return body;
}
