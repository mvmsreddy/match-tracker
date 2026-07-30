// Streak gamification — ported from ACE Tracker's insights.compute_streak
// (C:\ACETRACKING\backend\insights.py). A streak is consecutive days with at
// least one logged match or training session, tolerating up to `graceDays`
// missed days before it breaks, and skipping user-declared "freeze" dates
// (src/pages/ProfilePage.jsx's Streak Freeze card) entirely — neither logged
// nor missed. Pure function, no I/O — callers fetch match/training dates and
// freeze dates via the API and pass them in.

function toIso(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

function addDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function computeStreak(logDates, { today, graceDays = 1, freezeDates = [] } = {}) {
  const loggedSet = new Set((logDates || []).filter(Boolean));
  const frozenSet = new Set((freezeDates || []).filter(Boolean));
  const todayIso = toIso(today || new Date());
  const loggedToday = loggedSet.has(todayIso);
  const frozenToday = frozenSet.has(todayIso);

  // Current streak: walk backward from today. If today has no log yet,
  // don't treat the still-open day as a miss — start counting from
  // yesterday but still report loggedToday separately for the UI.
  let current = 0;
  let graceUsed = false;
  let cursor = (loggedSet.has(todayIso) || frozenSet.has(todayIso)) ? todayIso : addDays(todayIso, -1);
  // Cap the walk so a brand-new/empty history can't loop indefinitely.
  for (let i = 0; i < 3650; i++) {
    if (loggedSet.has(cursor) || frozenSet.has(cursor)) {
      if (loggedSet.has(cursor)) current += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!graceUsed && graceDays > 0) {
      graceUsed = true;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  // Best-ever streak: strict scan across all logged dates (no grace —
  // matches ACE Tracker's "best" definition), frozen dates still bridge gaps.
  const sortedDates = [...loggedSet].sort();
  let best = 0;
  let run = 0;
  let prevIso = null;
  for (const iso of sortedDates) {
    if (prevIso) {
      let gap = 0;
      for (let c = addDays(prevIso, 1); c < iso; c = addDays(c, 1)) {
        if (!frozenSet.has(c)) gap += 1;
      }
      run = gap === 0 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prevIso = iso;
  }

  return {
    current,
    best: Math.max(best, current),
    loggedToday,
    frozenToday,
    graceUsed,
    graceAvailable: graceDays > 0 && !graceUsed,
  };
}
