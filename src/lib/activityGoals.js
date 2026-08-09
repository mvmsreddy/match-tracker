import { minEligibleAgeGroup } from '../utils/eligibility';
import { circuitKey } from './governingBodies';

export const DEFAULT_MONTHLY_TARGET = 10;
export const DEFAULT_MINIMUM_MATCHES = 5;

export function matchMonthKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function resolveMatchDate(match) {
  if (!match) return null;
  return match.matchDate || match.date || (match.createdAt ? String(match.createdAt).slice(0, 10) : null);
}

export function countMatchesInMonth(matches, monthKeyStr) {
  return (matches || []).filter((m) => {
    const d = resolveMatchDate(m);
    return d && d.startsWith(monthKeyStr);
  }).length;
}

export function countMatchesBySegment(matches, category, subcategory) {
  return (matches || []).filter((m) => {
    if (m.normalizedCategory !== category || m.normalizedSubcategory !== subcategory) return false;
    return !!resolveMatchDate(m);
  }).length;
}

export function countMatchesThisMonthBySegment(matches, category, subcategory) {
  const key = matchMonthKey();
  return (matches || []).filter((m) => {
    if (m.normalizedCategory !== category || m.normalizedSubcategory !== subcategory) return false;
    const d = resolveMatchDate(m);
    return d && d.startsWith(key);
  }).length;
}

export function nativeCircuitKeyFromProfile(dateOfBirth, gender, tournamentYear = new Date().getFullYear()) {
  if (!dateOfBirth) return null;
  const ageGroup = minEligibleAgeGroup(dateOfBirth, tournamentYear);
  if (ageGroup === 'Open') {
    if (gender === 'F') return circuitKey('Women', 'Singles');
    if (gender === 'M') return circuitKey('Men', 'Singles');
    return null;
  }
  const subcategory = `U-${ageGroup.slice(1)}`;
  const category = gender === 'F' ? 'Girls' : 'Boys';
  return circuitKey(category, subcategory);
}

export function computeActivityPace(actual, monthlyTarget, minimumMatches, monthKeyStr = matchMonthKey()) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const currentKey = matchMonthKey();
  let elapsedDays = daysInMonth;
  if (monthKeyStr === currentKey) elapsedDays = new Date().getDate();
  else if (monthKeyStr > currentKey) elapsedDays = 0;

  const expectedByNow = monthlyTarget > 0
    ? Math.max(minimumMatches, Math.round((monthlyTarget * elapsedDays) / daysInMonth))
    : minimumMatches;

  return {
    actual,
    monthlyTarget,
    minimumMatches,
    expectedByNow,
    progressPct: monthlyTarget > 0 ? Math.min(100, Math.round((actual / monthlyTarget) * 100)) : 0,
    minimumMet: actual >= minimumMatches,
    behindPace: monthKeyStr === currentKey && actual < expectedByNow,
    daysLeft: monthKeyStr === currentKey ? Math.max(0, daysInMonth - elapsedDays) : 0,
  };
}

/** Consecutive weeks (Mon–Sun) with at least `minPerWeek` logged matches. */
export function computeMatchStreakWeeks(matches, minPerWeek = 2) {
  const byWeek = new Map();
  for (const m of matches || []) {
    const d = resolveMatchDate(m);
    if (!d) continue;
    const dt = new Date(`${d}T12:00:00`);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() + diff);
    const wk = monday.toISOString().slice(0, 10);
    byWeek.set(wk, (byWeek.get(wk) || 0) + 1);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b.localeCompare(a));
  let streak = 0;
  for (const wk of weeks) {
    if ((byWeek.get(wk) || 0) >= minPerWeek) streak += 1;
    else break;
  }
  return streak;
}

export function computeCourtReadiness({ activityPace, rankBehindPace, profileComplete }) {
  const activityScore = activityPace?.minimumMet
    ? Math.min(100, activityPace.progressPct)
    : Math.round((activityPace?.actual || 0) / Math.max(1, activityPace?.minimumMatches || DEFAULT_MINIMUM_MATCHES) * 50);
  const rankScore = rankBehindPace ? 35 : 75;
  const profileScore = profileComplete ? 100 : 40;
  return Math.round(activityScore * 0.4 + rankScore * 0.4 + profileScore * 0.2);
}

export function monthlyMatchVolumeSeries(matches, monthsBack = 6) {
  const rows = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = matchMonthKey(d);
    const label = d.toLocaleDateString('en-GB', { month: 'short' });
    rows.push({ month: key, label, count: countMatchesInMonth(matches, key) });
  }
  return rows;
}
