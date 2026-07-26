// Coach-side skill-group computation — deliberately NOT backed by a stored
// table (see supabase/phase31_drill_library.sql's comment for why). Computed
// fresh from each linked player's real tracked matches every time the coach
// views it, so it can never drift from the underlying match data the way a
// cached roll-up table could.
import * as api from '../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, strokeWinRates } from './segmentAnalytics';

const MIN_MATCHES = 4;     // matches the design spec's "at least four matches" threshold
const WEAK_THRESHOLD = 50; // win rate below this counts as a flagged weakness

// Flattens every linked player's every segment into one list of
// (player, segment) pairs, fetches that pair's tracked matches in parallel,
// and groups players sharing the same (category, subcategory, stroke)
// weakness together.
export async function computeSkillGroups(rosterWithSegments) {
  const pairs = [];
  for (const player of rosterWithSegments) {
    for (const seg of player.segments) pairs.push({ player, seg });
  }

  const results = await Promise.all(pairs.map(async ({ player, seg }) => {
    const matches = await api.getMatchesForSegment(player.id, seg.category, seg.subcategory);
    const tracked = matches.filter(m => m.points?.length > 0);
    if (tracked.length < MIN_MATCHES) return null;
    const rates = strokeWinRates(aggregateStrokeBreakdown(tracked), 5).filter(r => r.winRate !== null && r.winRate < WEAK_THRESHOLD);
    return rates.map(r => ({ category: seg.category, subcategory: seg.subcategory, stroke: r.stroke, playerId: player.id, name: player.displayName, winRate: r.winRate, matchCount: tracked.length, rank: seg.latest.rank }));
  }));

  const groups = new Map();
  for (const rows of results) {
    if (!rows) continue;
    for (const row of rows) {
      const key = `${row.category}|${row.subcategory}|${row.stroke}`;
      if (!groups.has(key)) groups.set(key, { category: row.category, subcategory: row.subcategory, stroke: row.stroke, members: [] });
      groups.get(key).members.push(row);
    }
  }
  return [...groups.values()].sort((a, b) => b.members.length - a.members.length);
}
