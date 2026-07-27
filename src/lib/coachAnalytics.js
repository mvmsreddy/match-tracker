// Coach-side skill-group + drill-correlation computation — deliberately NOT
// backed by stored roll-up tables (see supabase/phase31_drill_library.sql's
// comment for why). Computed fresh from each linked player's real tracked
// matches every time the coach views it, so it can never drift from the
// underlying match data the way a cached roll-up table could.
import * as api from '../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, aggregateServeStats, strokeWinRates } from './segmentAnalytics';
import { computeRankProgress } from './segments';

const MIN_MATCHES = 4;       // the design spec's "at least four matches"
const RECENT_WINDOW = 4;     // "across at least four matches" — the recent window compared to season
const GAP_THRESHOLD = 8;     // "more than eight points below their own season average"
const IMPROVEMENT_THRESHOLD = 3; // "improved by more than three points" (Progress Correlation)

const STROKE_KEYS = new Set(['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash']);

// Every metric skill-group derivation and Progress Correlation can key off —
// the 5 tracked strokes plus the two non-stroke rates the Coach Intelligence
// System mockup's own example groups need (break-point conversion, second-
// serve consistency). drill_library.skill_key can hold other free-text tags
// for library browsing, but only these are "groupable".
export const GROUPABLE_SKILL_KEYS = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'BreakPointConversion', 'SecondServe'];

// Resolves one metric's value (0-100) for a set of already-tracked matches,
// or null when there isn't enough data. Shared by skill-group derivation,
// the skill-group detail progress bars, and drill correlation, so all three
// agree on what "Break-point conversion" etc. actually means.
export function resolveMetric(trackedMatches, skillKey) {
  if (trackedMatches.length === 0) return null;
  if (STROKE_KEYS.has(skillKey)) {
    const row = strokeWinRates(aggregateStrokeBreakdown(trackedMatches), 1).find(r => r.stroke === skillKey);
    return row?.winRate ?? null;
  }
  if (skillKey === 'BreakPointConversion') {
    const bp = aggregateBreakPoints(trackedMatches);
    return bp.facedReturning > 0 ? bp.convertRate : null;
  }
  if (skillKey === 'SecondServe') {
    const s = aggregateServeStats(trackedMatches);
    return s.totalServicePts > 0 ? Math.round(s.secondPct) : null;
  }
  return null;
}

function trackedSorted(matches) {
  return matches.filter(m => m.points?.length > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Flattens every linked player's every segment into one list of
// (player, segment) pairs, fetches that pair's tracked matches in parallel,
// and groups players sharing the same (category, subcategory, skillKey)
// weakness together — real relative rule: a player's own last-4-match
// average for a metric sitting >= 8 points below their own season average.
export async function computeSkillGroups(rosterWithSegments) {
  const pairs = [];
  for (const player of rosterWithSegments) {
    for (const seg of player.segments) pairs.push({ player, seg });
  }

  const results = await Promise.all(pairs.map(async ({ player, seg }) => {
    const matches = await api.getMatchesForSegment(player.id, seg.category, seg.subcategory);
    const tracked = trackedSorted(matches);
    if (tracked.length < MIN_MATCHES) return null;
    const recent = tracked.slice(-RECENT_WINDOW);

    const rows = [];
    for (const skillKey of GROUPABLE_SKILL_KEYS) {
      const seasonAvg = resolveMetric(tracked, skillKey);
      const recentAvg = resolveMetric(recent, skillKey);
      if (seasonAvg == null || recentAvg == null) continue;
      const gap = seasonAvg - recentAvg;
      if (gap < GAP_THRESHOLD) continue;
      rows.push({
        category: seg.category, subcategory: seg.subcategory, skillKey,
        playerId: player.id, name: player.displayName, rank: seg.latest.rank,
        seasonAvg, recentAvg, gap, matchCount: tracked.length,
      });
    }
    return rows;
  }));

  const groups = new Map();
  for (const rows of results) {
    if (!rows) continue;
    for (const row of rows) {
      const key = `${row.category}|${row.subcategory}|${row.skillKey}`;
      if (!groups.has(key)) groups.set(key, { category: row.category, subcategory: row.subcategory, skillKey: row.skillKey, members: [] });
      groups.get(key).members.push(row);
    }
  }
  return [...groups.values()].sort((a, b) => b.members.length - a.members.length);
}

// Roster-wide "on pace for goal" summary — same real elapsed-time-vs-rank-
// progress comparison PlayerDashboardShell/GoalsPanel use for one player,
// aggregated across every linked player+segment with an active goal.
export async function computeGoalPaceSummary(rosterWithSegments) {
  const pairs = [];
  for (const player of rosterWithSegments) {
    for (const seg of player.segments) pairs.push({ player, seg });
  }

  const results = await Promise.all(pairs.map(async ({ player, seg }) => {
    const goals = await api.getRankingGoals(player.id, seg.category, seg.subcategory);
    const active = (goals || []).find(g => g.status === 'active');
    if (!active || !active.targetRank) return null;
    const startRank = seg.points[0]?.rank;
    const progress = computeRankProgress(startRank, seg.latest.rank, active.targetRank);
    if (progress == null) return null;

    let onPace = true;
    if (active.targetDate) {
      const startMs = new Date(seg.points[0].date).getTime();
      const endMs = new Date(active.targetDate).getTime();
      if (endMs > startMs) {
        const elapsedPct = Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100);
        onPace = progress >= elapsedPct - 3;
      }
    }
    return { playerId: player.id, onPace };
  }));

  const withData = results.filter(Boolean);
  return { onPaceCount: withData.filter(r => r.onPace).length, totalWithGoals: withData.length };
}

// Progress Correlation — for each of this coach's assignments whose block
// has actually run its course (today >= start_date + duration_weeks), pulls
// each assigned player's last 4 tracked matches strictly before the start
// date and first 4 strictly after the block ended, and compares the
// assignment's skill_key metric. Real, from real matches — an assignment
// with no players who have both a before and after sample simply doesn't
// appear (never a fabricated success rate).
export async function computeDrillCorrelation(coachId) {
  const assignments = await api.getDrillAssignments(coachId);
  const today = new Date();

  const completed = assignments.filter(a => {
    const end = new Date(a.startDate + 'T00:00:00');
    end.setDate(end.getDate() + a.durationWeeks * 7);
    return end <= today;
  });

  const results = await Promise.all(completed.map(async (a) => {
    const endDate = new Date(a.startDate + 'T00:00:00');
    endDate.setDate(endDate.getDate() + a.durationWeeks * 7);
    const endIso = endDate.toISOString().slice(0, 10);

    const perPlayer = await Promise.all(a.playerIds.map(async (playerId) => {
      const matches = await api.getMatchesForSegment(playerId, a.category, a.subcategory);
      const tracked = trackedSorted(matches);
      const before = tracked.filter(m => m.date < a.startDate).slice(-RECENT_WINDOW);
      const after = tracked.filter(m => m.date >= endIso).slice(0, RECENT_WINDOW);
      if (before.length === 0 || after.length === 0) return null;
      const beforeVal = resolveMetric(before, a.skillKey);
      const afterVal = resolveMetric(after, a.skillKey);
      if (beforeVal == null || afterVal == null) return null;
      return { playerId, before: beforeVal, after: afterVal, improved: (afterVal - beforeVal) >= IMPROVEMENT_THRESHOLD };
    }));

    const withData = perPlayer.filter(Boolean);
    if (withData.length === 0) return null;
    const improvedCount = withData.filter(p => p.improved).length;
    return {
      assignmentId: a.id, drillId: a.drillId, drillTitle: a.drillTitle, skillKey: a.skillKey,
      category: a.category, subcategory: a.subcategory,
      playersAssigned: a.playerIds.length, playersWithData: withData.length,
      frequencyPerWeek: a.frequencyPerWeek, durationWeeks: a.durationWeeks, startDate: a.startDate,
      avgBefore: Math.round(withData.reduce((s, p) => s + p.before, 0) / withData.length),
      avgAfter: Math.round(withData.reduce((s, p) => s + p.after, 0) / withData.length),
      successRate: Math.round((improvedCount / withData.length) * 100),
    };
  }));

  return results.filter(Boolean).sort((a, b) => b.successRate - a.successRate);
}
