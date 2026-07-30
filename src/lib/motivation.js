// Motivation engine — pure functions that turn a player's match/practice
// history into shareable, motivating numbers. Kept isolated so the Dashboard
// motivation widgets stay dumb presentational.

const LS_MISSION_STATE = 'mtp_mission_state_v1';
const LS_ACHIEVEMENTS = 'mtp_achievements_v1';

// ─── Momentum Meter ─────────────────────────────────────────────────────────
// Blends recent form + activity + streak into a single 0-100 "how hot are you"
// number. Deliberately simple so the player can read it at a glance.
export function computeMomentum({ matches = [], streak = 0, ratings = null }) {
  const matchOnly = matches.filter(m => m.sessionType !== 'practice');
  const last10 = matchOnly.slice(0, 10);

  // Recent form: win% of last 10 (0-40 points)
  const wins10 = last10.filter(m => m.winner === 'self').length;
  const formScore = last10.length > 0 ? (wins10 / last10.length) * 40 : 20;

  // Activity: sessions this week (0-25 points, cap at 5)
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = matches.filter(m => new Date(m.date).getTime() >= weekAgo).length;
  const activityScore = Math.min(1, thisWeek / 5) * 25;

  // Streak (0-20 points, cap at 10 days)
  const streakScore = Math.min(1, streak / 10) * 20;

  // Self-rated skill trend (0-15 points, cap at 8/10 avg)
  const avgSkill = ratings ? Object.values(ratings).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(ratings).length) : 5;
  const skillScore = Math.min(1, avgSkill / 8) * 15;

  const total = Math.round(formScore + activityScore + streakScore + skillScore);
  const label = total >= 80 ? 'On fire' : total >= 60 ? 'Climbing' : total >= 40 ? 'Holding' : total >= 20 ? 'Cooling' : 'Slow start';
  const tone = total >= 60 ? 'up' : total >= 40 ? 'flat' : 'down';
  return { score: total, label, tone, breakdown: { form: Math.round(formScore), activity: Math.round(activityScore), streak: Math.round(streakScore), skill: Math.round(skillScore) } };
}

// ─── Weekly Goal Rings ──────────────────────────────────────────────────────
// Three activity rings a-la Apple Watch: match sessions, practice sessions,
// hydration. Percentage 0-1, capped display but not capped values (so a great
// week can show a "boosted" ring style).
export function computeWeeklyRings({ matches = [], nutritionLogs = [] }) {
  const weekAgo = Date.now() - 7 * 86400000;

  const matchesThisWk = matches.filter(m => m.sessionType !== 'practice' && new Date(m.date).getTime() >= weekAgo).length;
  const practicesThisWk = matches.filter(m => m.sessionType === 'practice' && new Date(m.date).getTime() >= weekAgo).length;

  const waterMlThisWk = (nutritionLogs || [])
    .filter(l => l.date && new Date(l.date).getTime() >= weekAgo && l.type === 'water')
    .reduce((sum, l) => sum + (l.amountMl || 0), 0);

  const matchGoal = 3;
  const practiceGoal = 4;
  const waterGoal = 7 * 2500; // 2.5L/day * 7

  return {
    match: { done: matchesThisWk, goal: matchGoal, pct: matchesThisWk / matchGoal, unit: 'matches' },
    practice: { done: practicesThisWk, goal: practiceGoal, pct: practicesThisWk / practiceGoal, unit: 'practices' },
    water: { done: Math.round(waterMlThisWk / 1000 * 10) / 10, goal: waterGoal / 1000, pct: waterMlThisWk / waterGoal, unit: 'litres' },
  };
}

// ─── Daily Mission ──────────────────────────────────────────────────────────
// A single tap-to-complete micro-challenge that rotates daily.
const MISSIONS = [
  { id: 'log-match', title: 'Log a match today', desc: 'Track any singles or doubles session', kind: 'match', xp: 20 },
  { id: 'rate-latest', title: 'Rate your latest match', desc: 'Score yourself 1-10 on all 6 skill axes', kind: 'rate', xp: 15 },
  { id: 'drill-30', title: 'Complete a 30-min drill', desc: 'Any drill — serve, footwork, volley', kind: 'drill', xp: 20 },
  { id: 'water-2l', title: 'Hit 2L water intake', desc: 'Tap the water logger 8 times', kind: 'water', xp: 10 },
  { id: 'protein-meal', title: 'Log a protein-heavy meal', desc: 'At least 25g of protein in one meal', kind: 'meal', xp: 15 },
  { id: 'reflect-3', title: 'Write 3 lines of reflection', desc: 'Add notes to your latest match or practice', kind: 'notes', xp: 15 },
  { id: 'watch-pro', title: 'Watch 15 min of pro tennis', desc: 'Highlight reel, match, or coaching clip', kind: 'watch', xp: 10 },
];

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function getDailyMission(userId) {
  const state = readJSON(LS_MISSION_STATE, {});
  const key = `${userId}:${todayIso()}`;
  if (state[key]) return state[key];

  // Deterministic mission-of-the-day based on date, so all sessions see same
  const daySeed = todayIso().split('-').reduce((acc, n) => acc * 31 + Number(n), 0);
  const mission = MISSIONS[Math.abs(daySeed) % MISSIONS.length];
  state[key] = { ...mission, completed: false, completedAt: null };
  writeJSON(LS_MISSION_STATE, state);
  return state[key];
}

export function completeDailyMission(userId) {
  const state = readJSON(LS_MISSION_STATE, {});
  const key = `${userId}:${todayIso()}`;
  if (!state[key]) getDailyMission(userId);
  const fresh = readJSON(LS_MISSION_STATE, {});
  fresh[key] = { ...fresh[key], completed: true, completedAt: new Date().toISOString() };
  writeJSON(LS_MISSION_STATE, fresh);
  return fresh[key];
}

export function getMissionStreak(userId) {
  const state = readJSON(LS_MISSION_STATE, {});
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const key = `${userId}:${d.toISOString().slice(0, 10)}`;
    if (state[key]?.completed) streak++;
    else if (i > 0) break; // today may not be complete — that's OK
  }
  return streak;
}

// ─── Achievements ───────────────────────────────────────────────────────────
// Badges the player unlocks over time. Computed pure-fn from match history +
// streak — then persisted so we know WHEN each was unlocked (for animations).
export const ACHIEVEMENT_DEFS = [
  { id: 'first-match',      title: 'First Serve',        icon: 'trophy',  desc: 'Log your first match',          test: ({ matches }) => matches.length >= 1 },
  { id: 'first-win',        title: 'First Blood',        icon: 'award',   desc: 'Win your first match',          test: ({ wins }) => wins >= 1 },
  { id: 'three-set-win',    title: 'Three-Set Warrior',  icon: 'zap',     desc: 'Win a match that went 3 sets',  test: ({ matches }) => matches.some(m => m.winner === 'self' && (m.setsWon || 0) + (m.setsLost || 0) >= 3) },
  { id: 'streak-3',         title: 'Building Habits',    icon: 'flame',   desc: '3-day activity streak',         test: ({ streak }) => streak >= 3 },
  { id: 'streak-7',         title: 'Week Warrior',       icon: 'flame',   desc: '7-day streak',                  test: ({ streak }) => streak >= 7 },
  { id: 'streak-30',        title: 'Ironclad',           icon: 'shield',  desc: '30-day streak',                 test: ({ streak }) => streak >= 30 },
  { id: 'match-10',         title: 'Match Regular',      icon: 'target',  desc: 'Play 10 tracked matches',       test: ({ matches }) => matches.length >= 10 },
  { id: 'match-25',         title: 'Grinder',            icon: 'target',  desc: '25 tracked matches',            test: ({ matches }) => matches.length >= 25 },
  { id: 'win-5',            title: 'High Five',          icon: 'star',    desc: '5 match wins',                  test: ({ wins }) => wins >= 5 },
  { id: 'win-streak-3',     title: 'Hot Hand',           icon: 'flame',   desc: '3 wins in a row',               test: ({ matches }) => hasWinStreak(matches, 3) },
  { id: 'win-streak-5',     title: 'Untouchable',        icon: 'crown',   desc: '5 wins in a row',               test: ({ matches }) => hasWinStreak(matches, 5) },
  { id: 'first-drill',      title: 'Practice Perfect',   icon: 'dumbbell',desc: 'Log your first drill',          test: ({ drillCount }) => drillCount >= 1 },
  { id: 'drills-10',        title: 'Grinding',           icon: 'dumbbell',desc: '10 drills logged',              test: ({ drillCount }) => drillCount >= 10 },
  { id: 'rating-8',         title: 'Self-Aware',         icon: 'sparkles',desc: 'Rate a match 8+ overall',       test: ({ topRating }) => topRating >= 8 },
  { id: 'rank-climber',     title: 'Rank Climber',       icon: 'trending-up', desc: 'Move up 20+ ranks in a circuit', test: ({ maxRankImprovement }) => maxRankImprovement >= 20 },
];

function hasWinStreak(matches, n) {
  const ordered = matches.filter(m => m.sessionType !== 'practice' && m.winner).slice().reverse();
  let cur = 0;
  for (const m of ordered) {
    if (m.winner === 'self') { cur++; if (cur >= n) return true; }
    else cur = 0;
  }
  return false;
}

export function computeAchievements({ matches = [], streak = 0, drillCount = 0, ratings = null, rankHistory = null }) {
  const matchOnly = matches.filter(m => m.sessionType !== 'practice');
  const wins = matchOnly.filter(m => m.winner === 'self').length;
  const topRating = ratings ? Math.max(0, ...Object.values(ratings)) : 0;

  // Best rank improvement (first->best) per circuit
  let maxRankImprovement = 0;
  if (Array.isArray(rankHistory) && rankHistory.length > 0) {
    const byCircuit = {};
    for (const row of rankHistory) {
      const k = `${row.category}|${row.subcategory}`;
      if (!byCircuit[k]) byCircuit[k] = [];
      byCircuit[k].push(row);
    }
    for (const arr of Object.values(byCircuit)) {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      const first = arr[0].rank;
      const best = Math.min(...arr.map(r => r.rank));
      if (first - best > maxRankImprovement) maxRankImprovement = first - best;
    }
  }

  const ctx = { matches: matchOnly, wins, streak, drillCount, ratings, topRating, maxRankImprovement };
  const unlocked = [];
  const locked = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (def.test(ctx)) unlocked.push(def);
    else locked.push(def);
  }

  // Persist unlock timestamps so we can show "NEW" badges
  const store = readJSON(LS_ACHIEVEMENTS, {});
  let mutated = false;
  for (const a of unlocked) {
    if (!store[a.id]) { store[a.id] = { unlockedAt: new Date().toISOString() }; mutated = true; }
  }
  if (mutated) writeJSON(LS_ACHIEVEMENTS, store);

  return {
    unlocked: unlocked.map(a => ({ ...a, unlockedAt: store[a.id]?.unlockedAt })),
    locked,
    totalCount: ACHIEVEMENT_DEFS.length,
    unlockedCount: unlocked.length,
  };
}

// ─── Next Milestone ─────────────────────────────────────────────────────────
// One "you're X away from Y" line per player — turns cold ranking data into
// a concrete near-term goal.
export function computeNextMilestone({ circuits = [], matches = [], streak = 0 }) {
  const matchOnly = matches.filter(m => m.sessionType !== 'practice');
  const wins = matchOnly.filter(m => m.winner === 'self').length;

  // Priority 1: ranking-based milestone (top-N boundary)
  if (circuits.length > 0) {
    const active = circuits[0];
    const rank = active.latest.rank;
    const nextBoundary = [10, 25, 50, 100, 150, 200, 300, 500, 1000].find(b => rank > b);
    if (nextBoundary) {
      return {
        icon: 'trophy',
        headline: `${rank - nextBoundary} rank${rank - nextBoundary === 1 ? '' : 's'} to break top-${nextBoundary}`,
        sub: `${active.category} ${active.subcategory} · You're #${rank}`,
        progress: 1 - ((rank - nextBoundary) / rank),
      };
    }
    // Best-ever chase
    if (rank > active.bestRank) {
      return {
        icon: 'medal',
        headline: `${rank - active.bestRank} rank${rank - active.bestRank === 1 ? '' : 's'} from your all-time best`,
        sub: `${active.category} ${active.subcategory} · Best was #${active.bestRank}`,
        progress: active.bestRank / rank,
      };
    }
  }

  // Priority 2: win milestone
  const nextWinTarget = [5, 10, 25, 50, 100].find(b => wins < b);
  if (nextWinTarget) {
    return {
      icon: 'target',
      headline: `${nextWinTarget - wins} win${nextWinTarget - wins === 1 ? '' : 's'} to hit ${nextWinTarget} lifetime`,
      sub: `You've won ${wins} match${wins === 1 ? '' : 'es'} — keep swinging`,
      progress: wins / nextWinTarget,
    };
  }

  // Fallback: streak
  const nextStreakTarget = [3, 7, 14, 30, 60].find(b => streak < b);
  if (nextStreakTarget) {
    return {
      icon: 'flame',
      headline: `${nextStreakTarget - streak} day${nextStreakTarget - streak === 1 ? '' : 's'} to hit ${nextStreakTarget}-day streak`,
      sub: `Current streak: ${streak} day${streak === 1 ? '' : 's'}`,
      progress: streak / nextStreakTarget,
    };
  }

  return null;
}

// ─── LocalStorage helpers ───────────────────────────────────────────────────
function readJSON(k, fb) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
}
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
