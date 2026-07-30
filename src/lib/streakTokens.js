// Streak Freeze Tokens — a per-player, rate-limited "streak protector"
// currency that auto-consumes on a missed day so one skipped session doesn't
// blow up a long streak. Design:
//   - Players earn 1 token every 7 days (grace-accrued on load)
//   - Max 3 tokens in the vault (encourages using them, not hoarding)
//   - When computing the streak we look for the most recent "would-be miss"
//     day in the walk-back window and, if the player has a token, spend it
//     to convert that miss into a freeze (which streaks.js already knows
//     how to bridge across).
//   - Everything lives in localStorage — no backend, no clock skew games.

const LS_TOKEN_STATE = 'mtp_freeze_tokens_v1';
const MAX_TOKENS = 3;
const DAYS_PER_TOKEN = 7;
const DAY_MS = 86_400_000;

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function daysBetweenIso(a, b) {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY_MS);
}

function readState(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_TOKEN_STATE)) || {};
    return raw[userId] || null;
  } catch { return null; }
}

function writeState(userId, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_TOKEN_STATE)) || {};
    all[userId] = { ...(all[userId] || {}), ...patch };
    localStorage.setItem(LS_TOKEN_STATE, JSON.stringify(all));
    return all[userId];
  } catch { return null; }
}

// Grants any tokens the player has "earned" since last accrual (1 per 7 days).
// Idempotent — safe to call on every page load. Always persists a fully-formed
// state on the first call so subsequent partial patches (autoConsumed, tokens)
// never leave lastEarnedIso undefined.
export function accrueTokens(userId, today = todayIso()) {
  const existing = readState(userId);
  const state = existing && existing.lastEarnedIso
    ? existing
    : { tokens: 1, lastEarnedIso: today, autoConsumed: [] };
  if (!existing || !existing.lastEarnedIso) {
    writeState(userId, state);
  }
  const daysSince = daysBetweenIso(state.lastEarnedIso, today);
  const earned = Math.max(0, Math.floor(daysSince / DAYS_PER_TOKEN));
  if (earned === 0) return state;
  const newTokens = Math.min(MAX_TOKENS, (state.tokens || 0) + earned);
  const newLast = addDays(state.lastEarnedIso, earned * DAYS_PER_TOKEN);
  return writeState(userId, { tokens: newTokens, lastEarnedIso: newLast });
}

function addDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Returns the freeze dates the player has already auto-spent tokens on.
export function getAutoFreezes(userId) {
  const s = readState(userId);
  return s?.autoConsumed || [];
}

export function getTokenState(userId) {
  const state = accrueTokens(userId);
  const nextInDays = DAYS_PER_TOKEN - daysBetweenIso(state.lastEarnedIso, todayIso());
  return {
    tokens: state.tokens || 0,
    max: MAX_TOKENS,
    nextInDays: Math.max(0, nextInDays),
    autoConsumed: state.autoConsumed || [],
  };
}

// Walks the last 14 days and spends tokens on "bounded gap" days — i.e.
// missed days that sit BETWEEN two logged/frozen days. This is the
// canonical streak-freeze semantic: if you logged today AND 3 days ago,
// the missed yesterday + 2 days ago are recoverable. Trailing misses at
// the outer edge of the walk (no earlier anchor) are NOT touched — those
// represent inactivity, not a streak interruption. Persists spends so
// idempotent across renders/reloads.
export function autoProtectStreak(userId, logDates, existingFreezes = [], today = todayIso()) {
  const state = accrueTokens(userId, today);
  const already = new Set(state.autoConsumed || []);
  const logged = new Set(logDates || []);
  const frozen = new Set([...(existingFreezes || []), ...already]);
  let tokens = state.tokens || 0;

  // Find the OLDEST logged/frozen day within the 14-day window — that's the
  // outer boundary of the "active" run. Walk stops here.
  let oldestAnchor = null;
  for (let i = 14; i >= 0; i--) {
    const day = addDays(today, -i);
    if (logged.has(day) || frozen.has(day)) { oldestAnchor = day; break; }
  }
  if (!oldestAnchor) {
    return { freezeDates: [...frozen], newSpends: [], tokens };
  }

  // Walk from yesterday back to (but not through) oldestAnchor.
  const newSpends = [];
  for (let i = 1; tokens > 0; i++) {
    const day = addDays(today, -i);
    if (day <= oldestAnchor) break;
    if (logged.has(day) || frozen.has(day)) continue;
    tokens -= 1;
    frozen.add(day);
    newSpends.push(day);
  }

  if (newSpends.length > 0) {
    writeState(userId, {
      tokens,
      autoConsumed: [...(state.autoConsumed || []), ...newSpends],
    });
  }
  return { freezeDates: [...frozen], newSpends, tokens };
}
