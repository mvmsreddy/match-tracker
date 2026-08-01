import { createUserClient, isSupabaseServerConfigured, getBearerToken } from './_supabaseServer.js';

const RAZORPAY_KEY_ID = process.env.VITE_RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || 'Razorpay order creation failed');
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isSupabaseServerConfigured()) {
    res.status(503).json({ error: 'Supabase is not configured on the server.' });
    return;
  }
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    res.status(503).json({ error: 'Payments are not configured yet — missing Razorpay keys.' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  const supabase = createUserClient(token);
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }

  const { eventId } = req.body || {};
  if (!eventId) {
    res.status(400).json({ error: 'Missing eventId' });
    return;
  }

  try {
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, entries_open, is_doubles, tournament_week:tournament_weeks(entry_fee_singles)')
      .eq('id', eventId)
      .single();
    if (eventErr || !event) throw new Error('Event not found');
    if (event.is_doubles) throw new Error('Paid self-entry is only available for singles events right now.');
    if (!event.entries_open) throw new Error('Entries are not open for this event.');

    const feeRupees = event.tournament_week?.entry_fee_singles;
    if (!feeRupees || feeRupees <= 0) {
      res.status(200).json({ requiresPayment: false });
      return;
    }

    const { data: existing } = await supabase
      .from('draw_entries')
      .select('id')
      .eq('event_id', eventId)
      .or(`entered_by.eq.${user.id},player_id.eq.${user.id}`)
      .neq('entry_status', 'withdrawn')
      .eq('is_withdrawn', false)
      .limit(1);
    if (existing && existing.length > 0) throw new Error('You are already entered in this event.');

    const amountPaise = Math.round(feeRupees * 100);
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `${eventId}:${user.id}`.slice(0, 40),
      notes: { eventId, userId: user.id },
    });

    const { data: paymentRow, error: insertErr } = await supabase
      .from('event_payments')
      .insert({
        event_id: eventId,
        user_id: user.id,
        amount: amountPaise,
        razorpay_order_id: order.id,
      })
      .select('id')
      .single();
    if (insertErr) throw new Error(insertErr.message);

    res.status(200).json({
      requiresPayment: true,
      orderId: order.id,
      amount: amountPaise,
      keyId: RAZORPAY_KEY_ID,
      paymentId: paymentRow.id,
      prefill: { name: user.user_metadata?.name || '', email: user.email || '' },
    });
  } catch (err) {
    console.error('razorpay-order error', err);
    res.status(400).json({ error: err.message || 'Could not start payment' });
  }
}
