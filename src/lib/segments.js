// Shared segment/circuit logic — a player's AITA reg number can be live in
// several category/subcategory ranking lists at once ("playing up"), and each
// one is fully independent (see AITA_RANKINGS_PLAN.md — there is no point
// cascading between categories, confirmed against AITA's rules doc and live
// ranking data). This groups a flat ranking-history array into one time
// series per circuit, plus the summary stats a segment card/dashboard needs.
// Extracted out of PerformanceTab.jsx so SegmentContext and any other
// segment-scoped tab can reuse it without depending on that component.
import { circuitKey } from './governingBodies';
import { nativeCircuitKeyFromProfile } from './activityGoals';

export function buildCircuits(history) {
  const map = new Map();
  for (const row of history) {
    const key = circuitKey(row.category, row.subcategory);
    if (!map.has(key)) map.set(key, { category: row.category, subcategory: row.subcategory, points: [] });
    map.get(key).points.push(row);
  }
  const circuits = [];
  for (const c of map.values()) {
    c.points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = c.points[c.points.length - 1];
    const previous = c.points.length > 1 ? c.points[c.points.length - 2] : null;
    circuits.push({
      ...c,
      key: circuitKey(c.category, c.subcategory),
      latest,
      previous,
      bestRank: Math.min(...c.points.map(p => p.rank)),
      bestPoints: Math.max(...c.points.map(p => p.totalPoints)),
      firstSeen: c.points[0].date,
      snapshotCount: c.points.length,
    });
  }
  circuits.sort((a, b) => (a.latest.date < b.latest.date ? 1 : -1));
  return circuits;
}

// Progress = how far current rank has moved from the FIRST recorded rank
// toward the target, clamped since a player can start already better than
// their own target, or move the wrong direction. Shared by GoalsPanel
// (Overview tab) and PlayerDashboardShell (topbar goal bar) so both agree.
export function computeRankProgress(startRank, currentRank, targetRank) {
  if (!startRank || !targetRank || startRank === targetRank) return null;
  return Math.max(0, Math.min(100, Math.round(((startRank - currentRank) / (startRank - targetRank)) * 100)));
}

// Single source of truth for "is the player behind pace on their active
// goal". Previously computed three different ways in three different places
// (topbar + GoalsPanel used rank-vs-elapsed-time, Progress Tracker used a
// points straight-line projection) — a goal with both targetRank and
// targetPoints set could show "on pace" in the header and "behind pace" on
// the Progress tab at the same time. Prefers the points projection when the
// goal has a targetPoints (it's the more precise of the two: it compares an
// actual value against a real interpolated target for today's date, not a
// proxy), falling back to the rank/elapsed-time proxy otherwise.
export function computeGoalPace(circuit, goal) {
  if (!goal || !goal.targetDate) return null;
  const startPoint = circuit.points[0];
  if (!startPoint) return null;
  const startMs = new Date(startPoint.date).getTime();
  const endMs = new Date(goal.targetDate).getTime();
  if (endMs <= startMs) return null;

  if (goal.targetPoints) {
    const frac = Math.min(1, Math.max(0, (Date.now() - startMs) / (endMs - startMs)));
    const needed = Math.round(startPoint.totalPoints + (goal.targetPoints - startPoint.totalPoints) * frac);
    const actual = circuit.latest.totalPoints;
    const gap = needed - actual;
    return {
      metric: 'points',
      behindPace: actual < needed,
      note: actual < needed ? `BEHIND PACE — NEED ${gap} MORE POINTS BY NOW` : 'ON PACE',
    };
  }

  if (goal.targetRank) {
    const progressPct = computeRankProgress(startPoint.rank, circuit.latest.rank, goal.targetRank);
    if (progressPct == null) return null;
    const elapsedPct = Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100);
    const gap = elapsedPct - progressPct;
    return {
      metric: 'rank',
      behindPace: gap > 3,
      note: gap > 3
        ? `PACE MARKER AT ${elapsedPct}% — ${gap} POINTS BEHIND`
        : (gap < -3 ? `AHEAD OF PACE BY ${Math.abs(gap)} POINTS` : 'ON PACE'),
    };
  }

  return null;
}

/** Prefer the player's native age-group circuit; fall back to most-recent sync. */
export function resolveDefaultCircuitKey(circuits, { dateOfBirth, gender } = {}) {
  if (!circuits?.length) return null;
  const native = nativeCircuitKeyFromProfile(dateOfBirth, gender);
  if (native && circuits.some((c) => c.key === native)) return native;
  return circuits[0].key;
}

// PLACEHOLDER: any future *verified* cross-category point relationship would
// hook in here (e.g. a function describing how a result in one circuit
// affects another). Not implemented — an earlier spec draft assumed AITA
// ranking points "cascade" from a higher age group down to lower ones, but
// that was checked against AITA's actual rules document and live ranking PDFs
// and found false. Every circuit returned by buildCircuits() above is fully
// independent. Do not add roll-down/cascading logic here without first
// confirming a real, documented AITA rule.
