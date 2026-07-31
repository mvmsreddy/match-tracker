import { useState, useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { useSegment } from '../context/SegmentContext';
import { Card } from '@/components/primitives/card';
import { BarChart3, TrendingUp, Award } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function ChartTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-lg">
      <div className="font-bold text-sm">{payload[0].value}</div>
      <div className="text-muted-foreground mt-0.5">{valueLabel} · {formatDate(label)}</div>
    </div>
  );
}

/**
 * PerformanceSummarySection — inline ranking + points snapshot on the
 * player Dashboard. Shows the player's PRIMARY circuit (their strongest
 * by best-ever rank) by default, with pills to switch between other
 * circuits they're ranked in and a toggle to swap between points-growth
 * and rank-progress charts. Fully replaces the old "View My Performance"
 * standalone tab — all functionality is available here.
 */
export default function PerformanceSummarySection() {
  const { circuits, body, loading } = useSegment();
  const [chartMode, setChartMode] = useState('points'); // 'points' | 'rank'
  // Default to the player's STRONGEST circuit (lowest best-ever rank) — this
  // is the segment they identify with most and want to see first. Fall back
  // to the most recently active circuit if best ranks tie.
  const primaryIdx = useMemo(() => {
    if (!circuits || circuits.length === 0) return 0;
    let bestIdx = 0;
    for (let i = 1; i < circuits.length; i++) {
      if (circuits[i].bestRank < circuits[bestIdx].bestRank) bestIdx = i;
    }
    return bestIdx;
  }, [circuits]);
  const [activeIdx, setActiveIdx] = useState(null); // null = auto (use primary)
  const effectiveIdx = activeIdx == null ? primaryIdx : activeIdx;

  if (loading || !circuits || circuits.length === 0) return null;

  const active = circuits[effectiveIdx] || circuits[0];
  const rankDelta = active.previous ? active.previous.rank - active.latest.rank : 0;
  const pointsDelta = active.previous ? active.latest.totalPoints - active.previous.totalPoints : 0;

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="performance-summary">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">My Performance</div>
          <div className="text-sm font-bold mt-0.5">
            {active.category} {active.subcategory} · {body.label}
          </div>
        </div>
      </div>

      {/* Circuit pills (only if >1) */}
      {circuits.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {circuits.map((c, i) => (
            <button
              key={c.key}
              onClick={() => setActiveIdx(i)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                i === effectiveIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`performance-circuit-${c.key}`}
            >
              {c.category} {c.subcategory}
            </button>
          ))}
        </div>
      )}

      {/* Stat quad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Rank</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="font-display font-extrabold text-xl tracking-tighter">#{active.latest.rank}</div>
            {rankDelta !== 0 && (
              <span className={`text-[12px] font-bold ${rankDelta > 0 ? 'text-primary' : 'text-destructive'}`}>
                {rankDelta > 0 ? '▲' : '▼'}{Math.abs(rankDelta)}
              </span>
            )}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Points</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="font-display font-extrabold text-xl tracking-tighter text-primary">{active.latest.totalPoints}</div>
            {pointsDelta !== 0 && (
              <span className={`text-[12px] font-bold ${pointsDelta > 0 ? 'text-primary' : 'text-destructive'}`}>
                {pointsDelta > 0 ? '+' : ''}{pointsDelta}
              </span>
            )}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="flex items-center gap-1 text-[12px] uppercase tracking-wider font-bold text-muted-foreground">
            <Award className="w-3 h-3" />Best rank
          </div>
          <div className="font-display font-extrabold text-xl tracking-tighter mt-1">#{active.bestRank}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="flex items-center gap-1 text-[12px] uppercase tracking-wider font-bold text-muted-foreground">
            <TrendingUp className="w-3 h-3" />Best pts
          </div>
          <div className="font-display font-extrabold text-xl tracking-tighter mt-1">{active.bestPoints}</div>
        </div>
      </div>

      {active.points.length > 1 && (
        <>
          {/* Chart mode toggle */}
          <div className="flex items-center gap-1 mt-4 border border-border rounded-lg p-1 w-fit">
            <button
              onClick={() => setChartMode('points')}
              className={`px-3 py-1 rounded text-[11px] font-bold transition-colors ${
                chartMode === 'points' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="perf-chart-points"
            >
              Points growth
            </button>
            <button
              onClick={() => setChartMode('rank')}
              className={`px-3 py-1 rounded text-[11px] font-bold transition-colors ${
                chartMode === 'rank' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="perf-chart-rank"
            >
              Rank progress
            </button>
          </div>

          <div className="mt-3">
            <ResponsiveContainer width="100%" height={180} debounce={200}>
              {chartMode === 'points' ? (
                <AreaChart data={active.points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} minTickGap={30} />
                  <YAxis stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip valueLabel="Points" />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="totalPoints" stroke="var(--color-primary)" strokeWidth={2.5} fill="var(--color-primary)" fillOpacity={0.18} dot={false} activeDot={{ r: 5, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-primary)' }} />
                </AreaChart>
              ) : (
                <LineChart data={active.points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} minTickGap={30} />
                  <YAxis reversed stroke="var(--color-border)" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="rank" stroke="var(--color-chart-3)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-chart-3)' }} />
                </LineChart>
              )}
            </ResponsiveContainer>
            <div className="text-[12px] text-muted-foreground text-center mt-1">
              {chartMode === 'points' ? 'Points across snapshots' : 'Lower is better — axis inverted'}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
