import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList,
} from 'recharts';
import * as api from '../../api';
import { aggregateStrokeBreakdown, aggregateServeStats, aggregateRallyWinLoss } from '../../lib/segmentAnalytics';
import { useTournamentFunnel } from '../../hooks/useTournamentFunnel';
import { Card } from '@/components/primitives/card';
import { Target } from 'lucide-react';

const tooltipStyle = { background: 'var(--color-popover)', border: '1px solid var(--color-border)', borderRadius: 6 };

function EmptyPanel({ children }) {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
      <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

// Season-wide view combining three things a segment-level "how am I doing"
// question actually needs: how rally length affects point outcomes, serve
// precision, and tournament-bracket progression. Rally + serve panels reuse
// the same tracked-match aggregation as Match Analytics
// (src/lib/segmentAnalytics.js); the funnel panel is built separately from
// real official bracket results (see useTournamentFunnel), since round-by-
// round progression comes from tournament draws, not point-by-point tracking.
export default function SeasonAnalyticsTab({ circuit, playerId }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setMatches(null);
    api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setMatches(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load season analytics'); setMatches([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);
  const funnel = useTournamentFunnel(playerId, circuit);

  const rallyChartData = useMemo(() => {
    if (tracked.length === 0) return [];
    const r = aggregateRallyWinLoss(tracked);
    return r.cats.map((cat, i) => ({ rally: cat, Won: r.won[i], Lost: r.lost[i] }));
  }, [tracked]);

  const serve = useMemo(() => (tracked.length ? aggregateServeStats(tracked) : null), [tracked]);
  const secondPtsWonPct = serve && serve.secondIn > 0 ? Math.round((serve.wonOn2nd / serve.secondIn) * 100) : null;

  const strokeChartData = useMemo(() => {
    if (tracked.length === 0) return [];
    return aggregateStrokeBreakdown(tracked).map(s => ({ stroke: s.stroke, Winners: s.wfe, Unforced: s.ue }));
  }, [tracked]);

  const funnelChartData = useMemo(() => {
    if (funnel.stages.length === 0) return [];
    return [
      { stage: 'Entries', value: funnel.totalEntries, sub: `${funnel.totalEntries} entered` },
      ...funnel.stages.map(s => ({ stage: s.label, value: s.won, sub: `${s.won}/${s.played} won` })),
    ];
  }, [funnel]);

  if (matches === null) return <div className="text-sm text-muted-foreground">Loading season analytics…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="text-xs sm:text-sm text-muted-foreground bg-muted p-3 rounded-lg">
        <strong className="font-semibold">Across {tracked.length} tracked match{tracked.length === 1 ? '' : 'es'}</strong> and{' '}
        {funnel.totalEntries} tournament entr{funnel.totalEntries === 1 ? 'y' : 'ies'} in {circuit.category} {circuit.subcategory}
      </div>

      <Card className="p-4 sm:p-6 shadow-sm">
        <div className="font-bold text-sm sm:text-base mb-1">Rally Length Matrix</div>
        <div className="text-xs text-muted-foreground mb-4">Points won vs. lost by how long the rally ran</div>
        {rallyChartData.length === 0 ? (
          <EmptyPanel>No rally-length data yet — track a match in Plus or Expert mode to populate this.</EmptyPanel>
        ) : (
          <ResponsiveContainer width="100%" height={220} debounce={200}>
            <BarChart data={rallyChartData} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="rally"
                stroke="var(--color-border)"
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                tickLine={false}
                label={{ value: 'Rally length (shots)', position: 'insideBottom', offset: -4, fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Won" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Lost" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-4 sm:p-6 shadow-sm">
        <div className="font-bold text-sm sm:text-base mb-1">Serve &amp; Return Precision</div>
        <div className="text-xs text-muted-foreground mb-4">Serve reliability and winners vs. unforced errors by shot</div>
        {!serve || serve.totalServicePts === 0 ? (
          <EmptyPanel>No serve data yet for this segment.</EmptyPanel>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <div className="text-xs text-muted-foreground">1st Serve In</div>
                <div className="font-display font-extrabold text-2xl tracking-tighter">{Math.round(serve.firstPct)}%</div>
              </div>
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <div className="text-xs text-muted-foreground">2nd Serve Pts Won</div>
                <div className="font-display font-extrabold text-2xl tracking-tighter">{secondPtsWonPct !== null ? `${secondPtsWonPct}%` : '—'}</div>
              </div>
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <div className="text-xs text-muted-foreground">Aces</div>
                <div className="font-display font-extrabold text-2xl tracking-tighter text-accent-ink">{serve.aces}</div>
              </div>
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <div className="text-xs text-muted-foreground">Double Faults</div>
                <div className="font-display font-extrabold text-2xl tracking-tighter text-destructive">{serve.dfs}</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200} debounce={200}>
              <BarChart data={strokeChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="stroke" stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} />
                <YAxis stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Winners" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Unforced" fill="var(--color-destructive)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      <Card className="p-4 sm:p-6 shadow-sm">
        <div className="font-bold text-sm sm:text-base mb-1">Tournament Progression Funnel</div>
        <div className="text-xs text-muted-foreground mb-4">Wins at each bracket stage, from official tournament results — all entries to date in this segment</div>
        {funnel.loading ? (
          <div className="text-sm text-muted-foreground">Loading tournament progression…</div>
        ) : funnel.error ? (
          <div className="text-sm text-muted-foreground">{funnel.error}</div>
        ) : funnelChartData.length === 0 ? (
          <EmptyPanel>No official tournament results recorded yet for this segment.</EmptyPanel>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, funnelChartData.length * 42)} debounce={200}>
            <BarChart data={funnelChartData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="var(--color-border)" horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" stroke="var(--color-border)" tick={{ fill: 'var(--color-foreground)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={false} width={92} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="sub" position="right" style={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
