import { createClient } from '@supabase/supabase-js';

// Vercel exposes every configured env var to serverless functions via
// process.env regardless of the VITE_ prefix (that prefix only controls what
// Vite inlines into the browser bundle) — so the same Supabase URL/anon key
// values already configured for the frontend work here unchanged.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseServerConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// A client that carries the caller's own Supabase access token, so
// auth.uid() and every RLS policy resolve exactly as they would from the
// browser — used for anything that should only ever act as the logged-in
// player (creating their own pending payment, running self-entry placement).
export function createUserClient(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// A client that bypasses RLS entirely — used ONLY to flip event_payments
// between 'created'/'paid'/'failed' after independently verifying a
// Razorpay signature. There is deliberately no authenticated-role UPDATE
// policy on event_payments, so this privileged path is the sole way that
// transition can happen (see supabase/phase43_event_payments.sql).
export function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}
