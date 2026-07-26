import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { aggregateStrokeBreakdown, strokeWinRates } from '../../lib/segmentAnalytics';
import { normalizeEventSegment } from '../../lib/governingBodies';

// Rule-based (explicitly v1, not ML) recommendations — cross-references the
// segment's real ranking goal (Phase 3) with its weakest tracked stroke
// (Phase 5 aggregation) and its recent tournament-entry pace. Every segment
// shown here is this player's own independent standing in that category —
// no cross-segment point-transfer suggestions (the "cascading points" idea
// from an early draft of this spec was checked against AITA's actual rules
// and found false; see the plan doc's Context section). If this player is
// also active in another segment, that segment's own real progress can be
// viewed independently by switching segments in the picker above.
export default function RecommendationsTab({ circuit }) {
  const { user } = useAuth();
  const [goals, setGoals] = useState(null);
  const [matches, setMatches] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getRankingGoals(user.id, circuit.category, circuit.subcategory),
      api.getMatchesForSegment(user.id, circuit.category, circuit.subcategory),
      api.getMyEntries(),
    ]).then(([g, m, e]) => {
      if (cancelled) return;
      setGoals(g); setMatches(m); setEntries(e);
    }).catch(err => { if (!cancelled) { setError(err.message || 'Could not load recommendations'); setGoals([]); setMatches([]); setEntries([]); } });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');
  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);

  const weakestStroke = useMemo(() => {
    if (tracked.length === 0) return null;
    const rates = strokeWinRates(aggregateStrokeBreakdown(tracked)).filter(r => r.winRate !== null);
    if (rates.length === 0) return null;
    return rates.reduce((worst, r) => (r.winRate < worst.winRate ? r : worst));
  }, [tracked]);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter(e => {
      if (!e.event) return false;
      const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
      return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
    });
  }, [entries, circuit]);

  const recentEntries90d = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return segmentEntries.filter(e => (e.event.week?.startDate || '') >= cutoffIso).length;
  }, [segmentEntries]);

  if (goals === null) return <div className="history-empty">Loading recommendations…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  const rankGap = activeGoal?.targetRank ? circuit.latest.rank - activeGoal.targetRank : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!activeGoal && (
        <div className="history-empty">
          Set a ranking goal in the Overview tab to get gap-to-goal recommendations for {circuit.category} {circuit.subcategory}.
        </div>
      )}

      {activeGoal && rankGap !== null && (
        <div className="perf-chart-card" style={{ borderLeft: '3px solid var(--opp)', margin: 0 }}>
          <div style={{ font: '500 11px/1 monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--opp)' }}>Gap to goal</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12, lineHeight: 1.4 }}>
            {rankGap > 0
              ? <>You need to climb <span style={{ color: 'var(--accent)' }}>{rankGap} ranking places</span> to reach top {activeGoal.targetRank} in {circuit.category} {circuit.subcategory}.</>
              : <>You're already at or ahead of your top {activeGoal.targetRank} target for {circuit.category} {circuit.subcategory}.</>}
          </div>
        </div>
      )}

      {weakestStroke && (
        <div className="perf-chart-card" style={{ margin: 0 }}>
          <div style={{ font: '500 11px/1 monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--info)' }}>Training focus</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 12 }}>{weakestStroke.stroke} is your weakest tracked shot</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
            {weakestStroke.winRate}% win rate across {weakestStroke.total} tracked points this segment — log some {weakestStroke.stroke.toLowerCase()} drills in the Training tab and see if it moves.
          </div>
        </div>
      )}

      <div className="perf-chart-card" style={{ margin: 0 }}>
        <div style={{ font: '500 11px/1 monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)' }}>Tournament pace</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginTop: 12 }}>
          {recentEntries90d} {circuit.category} {circuit.subcategory} entr{recentEntries90d === 1 ? 'y' : 'ies'} in the last 90 days
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
          {recentEntries90d === 0
            ? 'No recent entries in this segment — ranking points only come from tournaments you actually enter, so consider signing up for one.'
            : 'Keep entering regularly — rankings in this segment only reflect the events you actually play.'}
        </div>
      </div>

      {!weakestStroke && tracked.length === 0 && (
        <div className="history-empty">Track a few matches in this segment to unlock training-focus recommendations.</div>
      )}
    </div>
  );
}
