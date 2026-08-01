import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../../api';
import { computeGoalPace } from '../../lib/segments';
import { Card } from '@/components/primitives/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';
import { AlertTriangle, TrendingUp, Activity, Award } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthKey(iso) {
  return iso.slice(0, 7); // 'YYYY-MM'
}

// Progress tracker — real points-over-time for this segment (circuit.points)
// plus, when an active goal exists, a straight-line projection from the
// goal's creation point to its target, so "behind/ahead of pace" is a real
// comparison against a real target rather than a fabricated pace marker.
// Monthly breakdown counts real training sessions logged per month alongside
// the ranking snapshots recorded that month.
export default function ProgressTab({ circuit, playerId }) {
  const [goals, setGoals] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getRankingGoals(playerId, circuit.category, circuit.subcategory),
      api.getTrainingSessions(playerId, circuit.category, circuit.subcategory),
    ]).then(([g, s]) => { if (!cancelled) { setGoals(g); setSessions(s); } })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load progress'); setGoals([]); setSessions([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');

  const chartData = useMemo(() => {
    const points = circuit.points.map(p => ({ date: p.date, actual: p.totalPoints }));
    if (!activeGoal?.targetDate || !activeGoal?.targetPoints) return points;
    const startDate = points[0]?.date;
    const startPoints = points[0]?.totalPoints || 0;
    if (!startDate) return points;
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(activeGoal.targetDate).getTime();
    if (endMs <= startMs) return points;
    return points.map(p => {
      const frac = Math.min(1, Math.max(0, (new Date(p.date).getTime() - startMs) / (endMs - startMs)));
      return { ...p, needed: Math.round(startPoints + (activeGoal.targetPoints - startPoints) * frac) };
    });
  }, [circuit, activeGoal]);

  const monthlyRows = useMemo(() => {
    const byMonth = new Map();
    for (const p of circuit.points) {
      const key = monthKey(p.date);
      byMonth.set(key, { month: key, points: p.totalPoints, rank: p.rank, training: 0 });
    }
    for (const s of (sessions || [])) {
      const key = monthKey(s.sessionDate);
      if (!byMonth.has(key)) byMonth.set(key, { month: key, points: null, rank: null, training: 0 });
      byMonth.get(key).training++;
    }
    return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
  }, [circuit, sessions]);

  if (goals === null) return <div className="text-sm text-muted-foreground">Loading progress…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  // Shared with the topbar/GoalsPanel verdict (src/lib/segments.js) so this
  // tab never shows "behind pace" while the header shows "on pace" for the
  // same goal.
  const goalPace = activeGoal ? computeGoalPace(circuit, activeGoal) : null;
  const behindPace = goalPace?.behindPace ?? false;

  return (
    <div className="space-y-4 sm:space-y-5">
      {behindPace && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive/30 bg-destructive/10 p-4 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1 text-sm font-bold leading-relaxed">
            You're currently behind the pace needed to hit your {circuit.category} {circuit.subcategory} goal by {activeGoal.targetDate ? formatDate(activeGoal.targetDate) : 'its target date'}.
          </div>
        </div>
      )}

      <Card className="p-4 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="font-bold text-sm sm:text-base mb-1">Actual vs projected points</div>
            <div className="text-xs text-muted-foreground">
              {activeGoal?.targetPoints ? 'Straight-line projection to your goal' : (activeGoal ? 'Set a points target on your goal to see a projection line' : 'Set a goal in Overview to see a projection line')}
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-primary" />
              <span className="font-semibold">Actual</span>
            </div>
            {activeGoal && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-destructive" />
                <span className="font-semibold">Needed</span>
              </div>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260} debounce={200}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate} 
              stroke="var(--color-border)" 
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} 
              tickLine={false} 
              minTickGap={40} 
            />
            <YAxis 
              stroke="var(--color-border)" 
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} 
              tickLine={false} 
              axisLine={false} 
              width={44} 
              domain={['auto', 'auto']} 
            />
            <Tooltip 
              labelFormatter={formatDate} 
              contentStyle={{ 
                background: 'var(--color-popover)', 
                border: '1px solid var(--color-border)', 
                borderRadius: 6 
              }} 
            />
            <Area 
              type="monotone" 
              dataKey="actual" 
              stroke="none" 
              fill="var(--color-primary)" 
              fillOpacity={0.15} 
              legendType="none" 
            />
            <Line 
              type="monotone" 
              dataKey="actual" 
              name="Actual" 
              stroke="var(--color-primary)" 
              strokeWidth={3} 
              dot={false} 
              activeDot={{ r: 6, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-primary)' }} 
            />
            {activeGoal && (
              <Line 
                type="monotone" 
                dataKey="needed" 
                name="Needed" 
                stroke="var(--color-destructive)" 
                strokeWidth={2.5} 
                strokeDasharray="5 4" 
                dot={false} 
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-0 overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 pb-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <div className="font-bold text-sm sm:text-base">Monthly breakdown</div>
          </div>
          <div className="text-xs text-muted-foreground">Your progress month by month</div>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold">Month</TableHead>
                <TableHead className="font-bold">Rank</TableHead>
                <TableHead className="font-bold">Points</TableHead>
                <TableHead className="font-bold">Training</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyRows.map((r, idx) => (
                <TableRow key={r.month} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{r.month}</TableCell>
                  <TableCell>
                    {r.rank ? (
                      <div className="flex items-center gap-1">
                        <span className="font-semibold">{r.rank}</span>
                        {idx < monthlyRows.length - 1 && monthlyRows[idx + 1].rank && (
                          <span className={`text-xs ${r.rank < monthlyRows[idx + 1].rank ? 'text-accent-ink' : 'text-destructive'}`}>
                            {r.rank < monthlyRows[idx + 1].rank ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="font-semibold">{r.points ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.training > 0 ? (
                        <>
                          <span className="font-semibold">{r.training}</span>
                          {r.training >= 10 && <Award className="w-4 h-4 text-accent-ink" />}
                        </>
                      ) : '—'}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
