import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../../api';
import { computeGoalPace } from '../../lib/segments';
import { Card } from '@/components/primitives/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

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
    <div className="space-y-4">
      {behindPace && (
        <div className="flex items-center gap-3 rounded-sm border border-destructive/30 bg-destructive/10 p-4">
          <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
          <div className="flex-1 text-sm font-bold">
            You're currently behind the pace needed to hit your {circuit.category} {circuit.subcategory} goal by {activeGoal.targetDate ? formatDate(activeGoal.targetDate) : 'its target date'}.
          </div>
        </div>
      )}

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="font-bold text-sm">Actual vs projected points</div>
            <div className="text-xs text-muted-foreground">
              {activeGoal?.targetPoints ? 'Straight-line projection to your goal' : (activeGoal ? 'Set a points target on your goal to see a projection line' : 'Set a goal in Overview to see a projection line')}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />Actual</div>
            {activeGoal && <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-destructive" />Needed</div>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--color-border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="hsl(var(--color-border))" tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} tickLine={false} minTickGap={40} />
            <YAxis stroke="hsl(var(--color-border))" tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
            <Tooltip labelFormatter={formatDate} contentStyle={{ background: 'hsl(var(--color-popover))', border: '1px solid hsl(var(--color-border))', borderRadius: 4 }} />
            <Area type="monotone" dataKey="actual" stroke="none" fill="hsl(var(--color-primary))" fillOpacity={0.12} legendType="none" />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="hsl(var(--color-primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: 'hsl(var(--color-card))', strokeWidth: 2, fill: 'hsl(var(--color-primary))' }} />
            {activeGoal && <Line type="monotone" dataKey="needed" name="Needed" stroke="hsl(var(--color-destructive))" strokeWidth={2} strokeDasharray="5 4" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 sm:p-6 pb-0"><div className="font-bold text-sm">Monthly breakdown</div></div>
        <div className="overflow-x-auto p-4 sm:p-6 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Training sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyRows.map(r => (
                <TableRow key={r.month}>
                  <TableCell>{r.month}</TableCell>
                  <TableCell>{r.rank ?? '—'}</TableCell>
                  <TableCell>{r.points ?? '—'}</TableCell>
                  <TableCell>{r.training}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
