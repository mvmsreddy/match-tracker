// Cross-segment coaching suggestions (Phase 7). For a player active in more
// than one segment (e.g. Boys U-14 and U-16 via "playing up"), compares that
// player's OWN independent stroke win rates between their segments side by
// side — e.g. "forehand win rate is worse in U16 than U14, more reps before
// the next U16 event." This is explicitly a same-player, same-stroke
// comparison across two independent standings, never a suggestion that a
// result in one segment affects the other's rank/points — the "cascading
// points" premise from an early spec draft was checked against AITA's actual
// rules and found false (see the plan doc's Context section). Segments here
// are informational side-by-side reads, nothing more.
import * as api from '../api';
import { aggregateStrokeBreakdown, strokeWinRates } from './segmentAnalytics';

const MIN_MATCHES = 3;

export async function computeCrossSegmentSuggestions(rosterWithSegments) {
  const suggestions = [];

  for (const player of rosterWithSegments) {
    if (player.segments.length < 2) continue; // needs at least 2 segments to compare

    const perSegmentRates = await Promise.all(player.segments.map(async (seg) => {
      const matches = await api.getMatchesForSegment(player.id, seg.category, seg.subcategory);
      const tracked = matches.filter(m => m.points?.length > 0);
      if (tracked.length < MIN_MATCHES) return null;
      return { segment: seg, rates: strokeWinRates(aggregateStrokeBreakdown(tracked), 3), matchCount: tracked.length };
    }));

    const withData = perSegmentRates.filter(Boolean);
    if (withData.length < 2) continue;

    // Compare every pair of segments this player is active in, per stroke.
    for (let i = 0; i < withData.length; i++) {
      for (let j = 0; j < withData.length; j++) {
        if (i === j) continue;
        const a = withData[i], b = withData[j];
        for (const strokeA of a.rates) {
          if (strokeA.winRate === null) continue;
          const strokeB = b.rates.find(r => r.stroke === strokeA.stroke);
          if (!strokeB || strokeB.winRate === null) continue;
          const gap = strokeB.winRate - strokeA.winRate; // b better than a
          if (gap < 15) continue; // only surface a meaningfully large gap
          suggestions.push({
            playerId: player.id,
            playerName: player.displayName,
            stroke: strokeA.stroke,
            weakerSegment: a.segment, weakerWinRate: strokeA.winRate,
            strongerSegment: b.segment, strongerWinRate: strokeB.winRate,
            gap,
            text: `${player.displayName}'s ${strokeA.stroke.toLowerCase()} win rate is ${gap} points lower in ${a.segment.category} ${a.segment.subcategory} (${strokeA.winRate}%) than in ${b.segment.category} ${b.segment.subcategory} (${strokeB.winRate}%). Since these are independent standings, focused ${strokeA.stroke.toLowerCase()} reps help the weaker one directly — results in one segment don't carry over to the other.`,
          });
        }
      }
    }
  }

  return suggestions.sort((a, b) => b.gap - a.gap);
}
