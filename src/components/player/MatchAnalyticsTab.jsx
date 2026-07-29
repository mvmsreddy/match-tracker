import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, aggregateServeStats, strokeWinRates } from '../../lib/segmentAnalytics';
import { Card } from '@/components/primitives/card';

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
      positive: delta > 0,
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
        positive: delta > 0,
        focus: 'Break-point simulation drills',
      });
    }
  }

  return trends.slice(0, 3);
}

// Real, segment-aggregated insight cards — "Forehand Dominance: 78% win rate"
// style cards computed from every tracked match in this segment
// (src/lib/segmentAnalytics.js), not fabricated. Cards only render when
// there's enough sample size (see strokeWinRates' minSample) to say
// something meaningful — an empty/low-data segment shows the empty state
// instead of a misleadingly confident-looking 0%/100% card.
export default function MatchAnalyticsTab({ circuit, playerId }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMatches(null);
    api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setMatches(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load match analytics'); setMatches([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

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
        positive: w.winRate >= 60,
      });
    }
    if (bp.facedServing >= 5) {
      cards.push({
        kind: bp.saveRate >= 60 ? 'Strength' : 'Watch',
        title: 'Break Point Saves',
        value: `${bp.saveRate}%`,
        body: `Saved ${bp.savedServing} of ${bp.facedServing} break points faced while serving.`,
        positive: bp.saveRate >= 60,
      });
    }
    if (bp.facedReturning >= 5) {
      cards.push({
        kind: bp.convertRate >= 40 ? 'Strength' : 'Watch',
        title: 'Break Point Conversion',
        value: `${bp.convertRate}%`,
        body: `Converted ${bp.wonReturning} of ${bp.facedReturning} break point chances while returning.`,
        positive: bp.convertRate >= 40,
      });
    }
    if (serve.totalServicePts >= 20) {
      cards.push({
        kind: serve.firstPct >= 60 ? 'Strength' : 'Watch',
        title: 'First Serve Rate',
        value: `${Math.round(serve.firstPct)}%`,
        body: `${Math.round(serve.firstPct)}% first serves in across ${serve.totalServicePts} service points, ${serve.aces} aces.`,
        positive: serve.firstPct >= 60,
      });
    }
    return cards;
  }, [tracked]);

  const trends = useMemo(() => buildTrends(tracked), [tracked]);

  if (matches === null) return <div className="text-sm text-muted-foreground">Loading match analytics…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Across {tracked.length} tracked match{tracked.length === 1 ? '' : 'es'} in {circuit.category} {circuit.subcategory}
        {matches.length > tracked.length ? ` (${matches.length - tracked.length} without tracker data)` : ''}
      </div>

      {tracked.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No tracked matches yet for this segment. Use "Track this match" from a tournament entry in the Tournaments tab to start building analytics here.
        </div>
      )}

      {insights.length === 0 && tracked.length > 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          Not enough tracked points yet for a reliable insight — keep tracking matches.
        </div>
      )}

      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {insights.map((i, idx) => (
            <Card key={idx} className={`p-4 border-t-4 ${i.positive ? 'border-t-primary' : 'border-t-destructive'}`}>
              <div className={`text-xs font-bold uppercase tracking-wider ${i.positive ? 'text-primary' : 'text-destructive'}`}>{i.kind}</div>
              <div className="text-sm font-bold mt-1">{i.title}</div>
              <div className={`font-display font-extrabold text-2xl tracking-tighter mt-1 ${i.positive ? 'text-primary' : 'text-destructive'}`}>{i.value}</div>
              <div className="text-xs text-muted-foreground mt-2">{i.body}</div>
            </Card>
          ))}
        </div>
      )}

      {trends.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm mb-1">Trends worth acting on</div>
          <div className="text-xs text-muted-foreground mb-4">Comparing your earlier vs. more recent tracked matches this segment</div>
          <div className="space-y-3">
            {trends.map((t, i) => (
              <div key={i} className={`border-l-4 ${t.positive ? 'border-primary' : 'border-destructive'} pl-3 py-1`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-48">
                    <div className="text-sm font-bold">{t.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.evidence}</div>
                  </div>
                  <div className={`font-display font-extrabold text-lg ${t.positive ? 'text-primary' : 'text-destructive'}`}>{t.stat}</div>
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mt-2">Focus &middot; {t.focus}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
