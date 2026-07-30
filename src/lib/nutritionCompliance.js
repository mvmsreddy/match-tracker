// Nutrition compliance + analytics — pure functions on top of the nutrition
// log store. Turns raw meals into: daily macro totals vs target, color-coded
// compliance status, weekly report cards, GI-trigger pattern detection.

import { getTargetForDay, getActiveDayType, listBodyLog } from './nutritionStore';

const DAY_MS = 86_400_000;

// Compliance bands as agreed with the user:
//   ±10% = green, ±20% = amber, ±30% = orange, beyond = red
export const COMPLIANCE_BANDS = {
  green:  { min: 0.90, max: 1.10, label: 'On target',  color: 'var(--color-primary)' },
  amber:  { min: 0.80, max: 1.20, label: 'Close',      color: '#f59e0b' },
  orange: { min: 0.70, max: 1.30, label: 'Off track',  color: '#f97316' },
  red:    { min: 0,    max: Infinity, label: 'Red flag', color: '#ef4444' },
};

export function bandFor(ratio) {
  if (ratio >= COMPLIANCE_BANDS.green.min && ratio <= COMPLIANCE_BANDS.green.max) return 'green';
  if (ratio >= COMPLIANCE_BANDS.amber.min && ratio <= COMPLIANCE_BANDS.amber.max) return 'amber';
  if (ratio >= COMPLIANCE_BANDS.orange.min && ratio <= COMPLIANCE_BANDS.orange.max) return 'orange';
  return 'red';
}

export function bandColor(band) {
  return COMPLIANCE_BANDS[band]?.color || COMPLIANCE_BANDS.red.color;
}

function todayIso() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Aggregate a day's logs into macro totals + subjective averages.
export function summariseDay(logs, dateIso) {
  const dayLogs = logs.filter(l => (l.logDate || l.createdAt?.slice(0, 10)) === dateIso);
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, hydrationMl: 0, sodiumMg: 0 };
  const subj = { courtEnergyVals: [], gutComfortVals: [], crampCount: 0 };
  for (const l of dayLogs) {
    totals.calories    += Number(l.calories) || 0;
    totals.proteinG    += Number(l.proteinG) || 0;
    totals.carbsG      += Number(l.carbsG) || 0;
    totals.fatsG       += Number(l.fatsG) || 0;
    totals.hydrationMl += Number(l.hydrationMl) || 0;
    totals.sodiumMg    += Number(l.sodiumMg) || 0;
    if (l.courtEnergy != null) subj.courtEnergyVals.push(Number(l.courtEnergy));
    if (l.gutComfort  != null) subj.gutComfortVals.push(Number(l.gutComfort));
    if (l.crampFlag) subj.crampCount += 1;
  }
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  return {
    date: dateIso,
    logs: dayLogs,
    totals,
    subjective: {
      courtEnergy: avg(subj.courtEnergyVals),
      gutComfort:  avg(subj.gutComfortVals),
      crampCount:  subj.crampCount,
    },
  };
}

// For a single day, compute compliance ratio & band per macro.
export function complianceForDay(logs, athleteId, dateIso = todayIso(), dayType = null) {
  const summary = summariseDay(logs, dateIso);
  const dt = dayType || getActiveDayType(athleteId);
  const target = getTargetForDay(athleteId, dt);
  const compliance = {};
  for (const key of ['calories', 'proteinG', 'carbsG', 'fatsG', 'hydrationMl', 'sodiumMg']) {
    const value = summary.totals[key] || 0;
    const goal  = target[key] || 0;
    const ratio = goal > 0 ? value / goal : 0;
    compliance[key] = { value, goal, ratio, band: goal > 0 ? bandFor(ratio) : 'red' };
  }
  return { ...summary, dayType: dt, target, compliance };
}

// Rolling 7-day report — hit% per macro, trend arrows, red-flag streak.
export function weeklyReport(logs, athleteId) {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const iso = d.toISOString().slice(0, 10);
    days.push(complianceForDay(logs, athleteId, iso));
  }
  const macros = ['calories', 'proteinG', 'carbsG', 'fatsG', 'hydrationMl'];
  const hitPct = {};
  for (const m of macros) {
    const greens = days.filter(day => day.compliance[m]?.band === 'green').length;
    hitPct[m] = Math.round((greens / days.length) * 100);
  }
  // Which macro was most consistently missed?
  const missedRates = macros.map(m => ({ macro: m, red: days.filter(d => ['orange', 'red'].includes(d.compliance[m]?.band)).length }));
  missedRates.sort((a, b) => b.red - a.red);
  const worstMacro = missedRates[0]?.red > 1 ? missedRates[0].macro : null;

  const avgEnergy = (() => {
    const vals = days.flatMap(d => d.subjective.courtEnergy != null ? [d.subjective.courtEnergy] : []);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  })();
  const cramps = days.reduce((s, d) => s + d.subjective.crampCount, 0);

  return { days, hitPct, worstMacro, avgEnergy, cramps };
}

// Trailing average compliance in the last N days for one macro
export function complianceStreakDays(logs, athleteId, macro = 'proteinG', targetBand = 'green') {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() - i * DAY_MS);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const iso = d.toISOString().slice(0, 10);
    const day = complianceForDay(logs, athleteId, iso);
    if (day.compliance[macro]?.band === targetBand && (day.logs.length > 0 || i === 0)) streak += 1;
    else if (i === 0) continue; // don't break on today if it's still-open
    else break;
  }
  return streak;
}

// ─── GI Trigger Detection ─────────────────────────────────────────────────
// For every meal logged within 6 hours BEFORE a discomfort report, extract
// keywords. Foods that appear repeatedly become "candidate triggers".
export function detectGiTriggers(logs) {
  const discomforts = logs.filter(l => l.gutComfort != null && Number(l.gutComfort) <= 5);
  if (discomforts.length < 2) return [];

  const commonWords = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'of', 'in', 'on', 'to', 'for', 'my', 'i', 'ate', 'had', 'some', 'few', 'lots', 'lot', 'pre', 'post', 'match']);
  const wordHits = new Map(); // word -> count of discomfort reports it precedes

  for (const bad of discomforts) {
    const badTime = new Date(bad.createdAt || bad.logDate).getTime();
    const priorMeals = logs.filter(l => {
      if (l.id === bad.id) return false;
      const t = new Date(l.createdAt || l.logDate).getTime();
      return t <= badTime && badTime - t <= 6 * 3600 * 1000;
    });
    const seenWordsThisDiscomfort = new Set();
    for (const meal of priorMeals) {
      const text = (meal.description + ' ' + (meal.notes || '')).toLowerCase();
      const words = text.split(/[^a-z]+/).filter(w => w.length >= 3 && !commonWords.has(w));
      for (const w of new Set(words)) seenWordsThisDiscomfort.add(w);
    }
    for (const w of seenWordsThisDiscomfort) {
      wordHits.set(w, (wordHits.get(w) || 0) + 1);
    }
  }

  const results = [...wordHits.entries()]
    .filter(([_, count]) => count >= 2) // must precede at least 2 discomforts
    .map(([word, count]) => ({ word, incidents: count, confidence: Math.min(1, count / discomforts.length) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  return results;
}

// ─── Nutrition Achievements ──────────────────────────────────────────────
// Pure test functions returning achievable/unlocked. Written like the main
// achievement library so they can slot into the trophy cabinet later.
export const NUTRITION_ACHIEVEMENTS = [
  { id: 'nut-first-log',      title: 'First Fuel',        icon: 'sparkles', desc: 'Log your first meal',                    test: ({ logs }) => logs.length >= 1 },
  { id: 'nut-hydro-hero',     title: 'Hydration Hero',    icon: 'droplet',  desc: '3 days in a row with ≥90% water target', test: ({ report, streakDays }) => streakDays.hydrationMl >= 3 },
  { id: 'nut-protein-pro',    title: 'Protein Pro',       icon: 'award',    desc: '3 days in a row hitting protein target', test: ({ streakDays }) => streakDays.proteinG >= 3 },
  { id: 'nut-perfect-prep',   title: 'Perfect Prep Week', icon: 'trophy',   desc: 'Full week ≥80% on every macro',           test: ({ report }) => Object.values(report.hitPct).every(p => p >= 70) },
  { id: 'nut-bounce-back',    title: 'Bounce Back',       icon: 'zap',      desc: 'Post-match recovery meal within 30 min', test: ({ hasRecoveryMeal }) => hasRecoveryMeal },
  { id: 'nut-gut-detective',  title: 'Gut Detective',     icon: 'target',   desc: 'Log gut comfort for 5+ days',             test: ({ gutLogDays }) => gutLogDays >= 5 },
  { id: 'nut-body-tracker',   title: 'Body Data Nerd',    icon: 'star',     desc: 'Log body composition for 4 weeks',        test: ({ bodyLogWeeks }) => bodyLogWeeks >= 4 },
];

export function computeNutritionAchievements(logs, athleteId) {
  const report = weeklyReport(logs, athleteId);
  const streakDays = {
    proteinG:    complianceStreakDays(logs, athleteId, 'proteinG'),
    hydrationMl: complianceStreakDays(logs, athleteId, 'hydrationMl'),
    carbsG:      complianceStreakDays(logs, athleteId, 'carbsG'),
  };
  const hasRecoveryMeal = logs.some(l => l.mealType === 'recovery' || (l.notes || '').toLowerCase().includes('post-match'));
  const gutLogDays = new Set(logs.filter(l => l.gutComfort != null).map(l => l.logDate)).size;
  const bodyLogWeeks = Math.floor(listBodyLog(athleteId).length / 2);

  const ctx = { logs, report, streakDays, hasRecoveryMeal, gutLogDays, bodyLogWeeks };
  const unlocked = [];
  const locked = [];
  for (const def of NUTRITION_ACHIEVEMENTS) {
    if (def.test(ctx)) unlocked.push(def);
    else locked.push(def);
  }
  return { unlocked, locked, totalCount: NUTRITION_ACHIEVEMENTS.length, unlockedCount: unlocked.length };
}
