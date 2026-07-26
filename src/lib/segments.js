// Shared segment/circuit logic — a player's AITA reg number can be live in
// several category/subcategory ranking lists at once ("playing up"), and each
// one is fully independent (see AITA_RANKINGS_PLAN.md — there is no point
// cascading between categories, confirmed against AITA's rules doc and live
// ranking data). This groups a flat ranking-history array into one time
// series per circuit, plus the summary stats a segment card/dashboard needs.
// Extracted out of PerformanceTab.jsx so SegmentContext and any other
// segment-scoped tab can reuse it without depending on that component.
import { circuitKey } from './governingBodies';

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

// PLACEHOLDER: any future *verified* cross-category point relationship would
// hook in here (e.g. a function describing how a result in one circuit
// affects another). Not implemented — an earlier spec draft assumed AITA
// ranking points "cascade" from a higher age group down to lower ones, but
// that was checked against AITA's actual rules document and live ranking PDFs
// and found false. Every circuit returned by buildCircuits() above is fully
// independent. Do not add roll-down/cascading logic here without first
// confirming a real, documented AITA rule.
