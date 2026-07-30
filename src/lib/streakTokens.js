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

// Walks back from today looking for the most recent logged/frozen day within
// a 14-day window. If found, every unlogged day BETWEEN that anchor and today
// is a "would-break-my-streak" candidate — spend a token per day (oldest
// miss first) until we run out. If there's no recent anchor, don't spend
// anything (nothing to protect). Persists spends so we don't double-count.
export function autoProtectStreak(userId, logDates, existingFreezes = [], today = todayIso()) {
  const state = accrueTokens(userId, today);
  const already = new Set(state.autoConsumed || []);
  const logged = new Set(logDates || []);
  const frozen = new Set([...(existingFreezes || []), ...already]);
  let tokens = state.tokens || 0;

  // Find the most recent logged/frozen anchor within the last 14 days
  let anchor = null;
  for (let i = 0; i <= 14; i++) {
    const day = addDays(today, -i);
    if (logged.has(day) || frozen.has(day)) { anchor = day; break; }
  }
  if (!anchor) {
    return { freezeDates: [...frozen], newSpends: [], tokens };
  }

  // Walk from yesterday back to the anchor, spending tokens on gaps.
  const newSpends = [];
  for (let d = addDays(today, -1); d > anchor && tokens > 0; d = addDays(d, -1)) {
    if (!logged.has(d) && !frozen.has(d)) {
      tokens -= 1;
      frozen.add(d);
      newSpends.push(d);
    }
  }

  if (newSpends.length > 0) {
    writeState(userId, {
      tokens,
      autoConsumed: [...(state.autoConsumed || []), ...newSpends],
    });
  }
  return { freezeDates: [...frozen], newSpends, tokens };
}
