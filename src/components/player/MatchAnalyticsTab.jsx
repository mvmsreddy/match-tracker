import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, aggregateServeStats, strokeWinRates } from '../../lib/segmentAnalytics';

// Real, segment-aggregated insight cards (Phase 5) — "Forehand Dominance: 78%
// win rate" style cards computed from every tracked match in this segment
// (src/lib/segmentAnalytics.js), not fabricated. Cards only render when
// there's enough sample size (see strokeWinRates' minSample) to say
// something meaningful — an empty/low-data segment shows the empty state
// instead of a misleadingly confident-looking 0%/100% card.
export default function MatchAnalyticsTab({ circuit }) {
  const { user } = useAuth();
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMatches(null);
    api.getMatchesForSegment(user.id, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setMatches(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load match analytics'); setMatches([]); } });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);

  const insights = useMemo(() => {
    if (tracked.length === 0) return [];
    const strokes = aggregateStrokeBreakdown(tracked);
    const winRates = strokeWinRates(strokes);
    const bp = aggregateBreakPoints(tracked);
    const serve = aggregateServeStats(tracked);

    const cards = [];
    for (const w of winRates) {
      if (w.winRate === null) continue;
      cards.push({
        kind: w.winRate >= 60 ? 'Strength' : 'Watch',
        title: `${w.stroke} ${w.winRate >= 60 ? 'Dominance' : 'Consistency'}`,
        value: `${w.winRate}%`,
        body: `${w.winRate}% win rate on ${w.stroke.toLowerCase()} shots across ${w.total} tracked points this segment.`,
        accent: w.winRate >= 60 ? 'var(--accent)' : 'var(--opp)',
      });
    }
    if (bp.facedServing >= 5) {
      cards.push({
        kind: bp.saveRate >= 60 ? 'Strength' : 'Watch',
        title: 'Break Point Saves',
        value: `${bp.saveRate}%`,
        body: `Saved ${bp.savedServing} of ${bp.facedServing} break points faced while serving.`,
        accent: bp.saveRate >= 60 ? 'var(--accent)' : 'var(--opp)',
      });
    }
    if (bp.facedReturning >= 5) {
      cards.push({
        kind: bp.convertRate >= 40 ? 'Strength' : 'Watch',
        title: 'Break Point Conversion',
        value: `${bp.convertRate}%`,
        body: `Converted ${bp.wonReturning} of ${bp.facedReturning} break point chances while returning.`,
        accent: bp.convertRate >= 40 ? 'var(--accent)' : 'var(--opp)',
      });
    }
    if (serve.totalServicePts >= 20) {
      cards.push({
        kind: serve.firstPct >= 60 ? 'Strength' : 'Watch',
        title: 'First Serve Rate',
        value: `${Math.round(serve.firstPct)}%`,
        body: `${Math.round(serve.firstPct)}% first serves in across ${serve.totalServicePts} service points, ${serve.aces} aces.`,
        accent: serve.firstPct >= 60 ? 'var(--accent)' : 'var(--opp)',
      });
    }
    return cards;
  }, [tracked]);

  if (matches === null) return <div className="history-empty">Loading match analytics…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="t-info-item">
        Across {tracked.length} tracked match{tracked.length === 1 ? '' : 'es'} in {circuit.category} {circuit.subcategory}
        {matches.length > tracked.length ? ` (${matches.length - tracked.length} without tracker data)` : ''}
      </div>

      {tracked.length === 0 && (
        <div className="history-empty">
          No tracked matches yet for this segment. Use "Track this match" from a tournament entry in the Tournaments tab to start building analytics here.
        </div>
      )}

      {insights.length === 0 && tracked.length > 0 && (
        <div className="history-empty">Not enough tracked points yet for a reliable insight — keep tracking matches.</div>
      )}

      {insights.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          {insights.map((i, idx) => (
            <div key={idx} className="perf-chart-card" style={{ borderTop: `3px solid ${i.accent}`, margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ font: '500 10px/1 monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: i.accent }}>{i.kind}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, marginTop: 12 }}>{i.title}</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: i.accent, margin: '14px 0' }}>{i.value}</div>
              <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 }}>{i.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
