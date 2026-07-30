import { useEffect, useMemo, useState } from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import * as api from '../../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, aggregateServeStats, strokeWinRates } from '../../lib/segmentAnalytics';
import { Card } from '@/components/primitives/card';
import { TrendingUp, TrendingDown, Award, AlertTriangle, Target, Zap } from 'lucide-react';

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
        icon: w.winRate >= 60 ? Award : AlertTriangle,
      });
    }
    if (bp.facedServing >= 5) {
      cards.push({
        kind: bp.saveRate >= 60 ? 'Strength' : 'Watch',
        title: 'Break Point Saves',
        value: `${bp.saveRate}%`,
        body: `Saved ${bp.savedServing} of ${bp.facedServing} break points faced while serving.`,
        positive: bp.saveRate >= 60,
        icon: bp.saveRate >= 60 ? Award : AlertTriangle,
      });
    }
    if (bp.facedReturning >= 5) {
      cards.push({
        kind: bp.convertRate >= 40 ? 'Strength' : 'Watch',
        title: 'Break Point Conversion',
        value: `${bp.convertRate}%`,
        body: `Converted ${bp.wonReturning} of ${bp.facedReturning} break point chances while returning.`,
        positive: bp.convertRate >= 40,
        icon: bp.convertRate >= 40 ? Award : AlertTriangle,
      });
    }
    if (serve.totalServicePts >= 20) {
      cards.push({
        kind: serve.firstPct >= 60 ? 'Strength' : 'Watch',
        title: 'First Serve Rate',
        value: `${Math.round(serve.firstPct)}%`,
        body: `${Math.round(serve.firstPct)}% first serves in across ${serve.totalServicePts} service points, ${serve.aces} aces.`,
        positive: serve.firstPct >= 60,
        icon: serve.firstPct >= 60 ? Zap : Target,
      });
    }
    return cards;
  }, [tracked]);

  const trends = useMemo(() => buildTrends(tracked), [tracked]);
  
  // Prepare bar chart data for stroke win rates
  const strokeChartData = useMemo(() => {
    if (tracked.length === 0) return [];
    const strokes = aggregateStrokeBreakdown(tracked);
    const winRates = strokeWinRates(strokes, 3);
    return winRates.map(w => ({
      stroke: w.stroke,
      winRate: w.winRate || 0,
      color: (w.winRate || 0) >= 60 ? 'hsl(var(--color-primary))' : 'hsl(var(--color-destructive))',
    }));
  }, [tracked]);

  // Prepare radar chart data — comprehensive skill breakdown
  const skillRadarData = useMemo(() => {
    if (tracked.length === 0) return [];
    const strokes = aggregateStrokeBreakdown(tracked);
    const winRates = strokeWinRates(strokes, 3);
    const bp = aggregateBreakPoints(tracked);
    const serve = aggregateServeStats(tracked);
    
    const data = [];
    
    // Add stroke-based skills
    for (const w of winRates) {
      if (w.winRate !== null) {
        data.push({
          skill: w.stroke,
          value: w.winRate,
          fullMark: 100,
        });
      }
    }
    
    // Add serve skill
    if (serve.totalServicePts >= 20) {
      data.push({
        skill: 'Serving',
        value: Math.round(serve.firstPct),
        fullMark: 100,
      });
    }
    
    // Add break point saves
    if (bp.facedServing >= 3) {
      data.push({
        skill: 'BP Saves',
        value: bp.saveRate,
        fullMark: 100,
      });
    }
    
    // Add break point conversions
    if (bp.facedReturning >= 3) {
      data.push({
        skill: 'BP Convert',
        value: bp.convertRate,
        fullMark: 100,
      });
    }
    
    return data;
  }, [tracked]);

  if (matches === null) return <div className="text-sm text-muted-foreground">Loading match analytics…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="text-xs sm:text-sm text-muted-foreground bg-muted p-3 rounded-lg">
        <strong className="font-semibold">Across {tracked.length} tracked match{tracked.length === 1 ? '' : 'es'}</strong> in {circuit.category} {circuit.subcategory}
        {matches.length > tracked.length ? ` · ${matches.length - tracked.length} without tracker data` : ''}
      </div>

      {tracked.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">
            No tracked matches yet for this segment. Use "Track this match" from a tournament entry in the Tournaments tab to start building analytics here.
          </div>
        </div>
      )}

      {insights.length === 0 && tracked.length > 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">
            Not enough tracked points yet for a reliable insight — keep tracking matches.
          </div>
        </div>
      )}

      {/* Stroke Win Rates Bar Chart */}
      {strokeChartData.length > 0 && (
        <Card className="p-4 sm:p-6 shadow-sm">
          <div className="font-bold text-sm sm:text-base mb-1">Stroke Win Rates</div>
          <div className="text-xs text-muted-foreground mb-4">Performance across different shot types</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={strokeChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--color-border))" vertical={false} strokeDasharray="3 3" />
              <XAxis 
                dataKey="stroke" 
                stroke="hsl(var(--color-border))" 
                tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} 
                tickLine={false} 
              />
              <YAxis 
                stroke="hsl(var(--color-border))" 
                tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} 
                tickLine={false} 
                axisLine={false} 
                width={40}
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'hsl(var(--color-popover))', 
                  border: '1px solid hsl(var(--color-border))', 
                  borderRadius: 6 
                }}
                formatter={(value) => [`${value}%`, 'Win Rate']}
              />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {strokeChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Skill Radar Chart — comprehensive skills overview */}
      {skillRadarData.length >= 3 && (
        <Card className="p-4 sm:p-6 shadow-sm">
          <div className="font-bold text-sm sm:text-base mb-1">Skills Breakdown</div>
          <div className="text-xs text-muted-foreground mb-4">Your all-round performance profile</div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={skillRadarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="hsl(var(--color-border))" strokeDasharray="3 3" />
              <PolarAngleAxis 
                dataKey="skill" 
                tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 11, fontWeight: 600 }} 
              />
              <PolarRadiusAxis 
                domain={[0, 100]} 
                tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 9 }}
                axisLine={false}
                tickCount={5}
              />
              <Radar 
                name="Skills" 
                dataKey="value" 
                stroke="hsl(var(--color-primary))" 
                fill="hsl(var(--color-primary))" 
                fillOpacity={0.35} 
                strokeWidth={2.5}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'hsl(var(--color-popover))', 
                  border: '1px solid hsl(var(--color-border))', 
                  borderRadius: 6 
                }}
                formatter={(value) => [`${value}%`, 'Score']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {insights.map((i, idx) => {
            const IconComponent = i.icon;
            return (
              <Card 
                key={idx} 
                className={`p-4 sm:p-5 border-l-4 hover:shadow-md transition-shadow ${
                  i.positive ? 'border-l-primary bg-gradient-to-br from-primary/5 to-transparent' : 'border-l-destructive bg-gradient-to-br from-destructive/5 to-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`text-xs font-bold uppercase tracking-wider ${i.positive ? 'text-primary' : 'text-destructive'}`}>
                    {i.kind}
                  </div>
                  <IconComponent className={`w-5 h-5 ${i.positive ? 'text-primary' : 'text-destructive'}`} />
                </div>
                <div className="text-sm font-bold mb-1">{i.title}</div>
                <div className={`font-display font-extrabold text-3xl tracking-tighter mb-3 ${i.positive ? 'text-primary' : 'text-destructive'}`}>
                  {i.value}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">{i.body}</div>
              </Card>
            );
          })}
        </div>
      )}

      {trends.length > 0 && (
        <Card className="p-4 sm:p-6 shadow-sm">
          <div className="font-bold text-sm sm:text-base mb-1">Trends worth acting on</div>
          <div className="text-xs text-muted-foreground mb-4">Comparing your earlier vs. more recent tracked matches this segment</div>
          <div className="space-y-4">
            {trends.map((t, i) => {
              const TrendIcon = t.positive ? TrendingUp : TrendingDown;
              return (
                <div 
                  key={i} 
                  className={`border-l-4 ${t.positive ? 'border-primary bg-primary/5' : 'border-destructive bg-destructive/5'} rounded-r-lg pl-4 pr-4 py-3`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendIcon className={`w-4 h-4 ${t.positive ? 'text-primary' : 'text-destructive'}`} />
                        <div className="text-sm font-bold">{t.title}</div>
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{t.evidence}</div>
                    </div>
                    <div className={`font-display font-extrabold text-2xl ${t.positive ? 'text-primary' : 'text-destructive'}`}>
                      {t.stat}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground uppercase tracking-wider font-bold">
                    <Target className="w-3.5 h-3.5" />
                    <span>Focus · {t.focus}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
