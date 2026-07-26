import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, aggregateServeStats, strokeWinRates } from '../../lib/segmentAnalytics';

// Rule-based trend detection: splits the segment's tracked matches (oldest
// first) into an earlier and a more-recent half and compares real aggregated
// numbers between them — a genuine "is this getting better or worse" signal,
// not fabricated copy. The "focus" line names a plausible practice area tied
// to the real stat that moved, since there's no real coach-assigned drill
// library yet to pull an actual drill from (see Recommendations tab).
function buildTrends(tracked) {
  if (tracked.length < 6) return [];
  const byDate = [...tracked].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const mid = Math.floor(byDate.length / 2);
  const early = byDate.slice(0, mid);
  const recent = byDate.slice(mid);

  const trends = [];
  const earlyRates = strokeWinRates(aggregateStrokeBreakdown(early), 3);
  const recentRates = strokeWinRates(aggregateStrokeBreakdown(recent), 3);
  for (const r of recentRates) {
    const e = earlyRates.find(x => x.stroke === r.stroke);
    if (r.winRate == null || e?.winRate == null) continue;
    const delta = r.winRate - e.winRate;
    if (Math.abs(delta) < 8) continue;
    trends.push({
      title: `${r.stroke} win rate ${delta > 0 ? 'improving' : 'slipping'} recently`,
      evidence: `${r.winRate}% across your ${recent.length} most recent tracked matches, vs ${e.winRate}% in the ${early.length} before that.`,
      stat: `${delta > 0 ? '+' : ''}${delta}`,
      accent: delta > 0 ? 'var(--accent)' : 'var(--opp)',
      focus: `${r.stroke} consistency reps`,
    });
  }

  const earlyBp = aggregateBreakPoints(early);
  const recentBp = aggregateBreakPoints(recent);
  if (earlyBp.convertRate != null && recentBp.convertRate != null) {
    const delta = recentBp.convertRate - earlyBp.convertRate;
    if (Math.abs(delta) >= 8) {
      trends.push({
        title: `Break-point conversion ${delta > 0 ? 'trending up' : 'trending down'}`,
        evidence: `Converted ${recentBp.wonReturning}/${recentBp.facedReturning} recently vs ${earlyBp.wonReturning}/${earlyBp.facedReturning} earlier this segment.`,
        stat: `${delta > 0 ? '+' : ''}${delta}`,
        accent: delta > 0 ? 'var(--accent)' : 'var(--opp)',
        focus: 'Break-point simulation drills',
      });
    }
  }

  return trends.slice(0, 3);
}

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

  const trends = useMemo(() => buildTrends(tracked), [tracked]);

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
        <div className="pcd-stat-grid n2">
          {insights.map((i, idx) => (
            <div key={idx} className="pcd-insight-card" style={{ borderTopColor: i.accent }}>
              <div className="pcd-insight-head">
                <div className="pcd-insight-kind" style={{ color: i.accent }}>{i.kind}</div>
              </div>
              <div className="pcd-insight-title">{i.title}</div>
              <div className="pcd-insight-value-row">
                <div className="pcd-insight-value" style={{ color: i.accent }}>{i.value}</div>
              </div>
              <div className="pcd-insight-body">{i.body}</div>
            </div>
          ))}
        </div>
      )}

      {trends.length > 0 && (
        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 4 }}>Trends worth acting on</div>
          <div className="pcd-card-sub" style={{ marginBottom: 18 }}>Comparing your earlier vs. more recent tracked matches this segment</div>
          {trends.map((t, i) => (
            <div key={i} className="pcd-trend-row" style={{ borderLeftColor: t.accent }}>
              <div className="pcd-trend-top">
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="pcd-trend-title">{t.title}</div>
                  <div className="pcd-trend-evidence">{t.evidence}</div>
                </div>
                <div className="pcd-trend-stat" style={{ color: t.accent }}>{t.stat}</div>
              </div>
              <div className="pcd-trend-foot">
                <div className="pcd-trend-drill">FOCUS · {t.focus}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
