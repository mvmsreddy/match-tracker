// Lightweight localStorage helpers for features that don't have a Supabase
// backend yet (drills, water quick-logs, skill self-ratings, dashboard prefs).
// Each helper is namespaced by userId so multiple demo accounts don't collide.

function key(scope, userId) { return `tt.${scope}.${userId || 'anon'}`; }

function read(scope, userId, fallback) {
  try {
    const raw = localStorage.getItem(key(scope, userId));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(scope, userId, value) {
  try { localStorage.setItem(key(scope, userId), JSON.stringify(value)); } catch {}
}

// ── Drills ─────────────────────────────────────────────────────────
export function listDrills(userId) {
  return read('drills', userId, []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
export function createDrill(userId, drill) {
  const rec = {
    id: `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...drill,
  };
  const all = read('drills', userId, []);
  all.unshift(rec);
  write('drills', userId, all);
  return rec;
}
export function deleteDrill(userId, id) {
  const all = read('drills', userId, []).filter(d => d.id !== id);
  write('drills', userId, all);
}

// ── Water quick-log ────────────────────────────────────────────────
export function todayWaterMl(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const log = read('water', userId, {});
  return log[today] || 0;
}
export function addWaterMl(userId, ml) {
  const today = new Date().toISOString().slice(0, 10);
  const log = read('water', userId, {});
  log[today] = (log[today] || 0) + ml;
  write('water', userId, log);
  return log[today];
}
export function resetTodayWater(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const log = read('water', userId, {});
  delete log[today];
  write('water', userId, log);
}
export function weeklyWaterAvg(userId) {
  const log = read('water', userId, {});
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(log[d.toISOString().slice(0, 10)] || 0);
  }
  const total = days.reduce((s, x) => s + x, 0);
  return { avg: Math.round(total / 7), total, days: days.reverse() };
}

// ── Skill self-ratings (per match) ─────────────────────────────────
export function saveSkillRatings(userId, matchId, ratings) {
  const all = read('skills', userId, {});
  all[matchId] = { ...ratings, ratedAt: new Date().toISOString() };
  write('skills', userId, all);
}
export function getLatestSkillRatings(userId, limit = 5) {
  const all = read('skills', userId, {});
  return Object.entries(all)
    .sort(([, a], [, b]) => (b.ratedAt || '').localeCompare(a.ratedAt || ''))
    .slice(0, limit)
    .map(([matchId, r]) => ({ matchId, ...r }));
}
export function avgSkillRatings(userId, limit = 5) {
  const items = getLatestSkillRatings(userId, limit);
  if (items.length === 0) return null;
  const keys = ['serve', 'forehand', 'backhand', 'volley', 'footwork', 'mental'];
  const out = {};
  for (const k of keys) {
    const values = items.map(i => Number(i[k]) || 0).filter(v => v > 0);
    out[k] = values.length ? Math.round(values.reduce((s, x) => s + x, 0) / values.length) : 0;
  }
  return out;
}

// ── Dashboard reminder dismiss (session-scoped) ────────────────────
export function reminderDismissedToday() {
  const today = new Date().toISOString().slice(0, 10);
  return sessionStorage.getItem('tt.reminderDismissed') === today;
}
export function dismissReminderToday() {
  const today = new Date().toISOString().slice(0, 10);
  sessionStorage.setItem('tt.reminderDismissed', today);
}
