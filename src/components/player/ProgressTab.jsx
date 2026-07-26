import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthKey(iso) {
  return iso.slice(0, 7); // 'YYYY-MM'
}

// Progress tracker (Phase 5) — real points-over-time for this segment
// (circuit.points) plus, when an active goal exists, a straight-line
// projection from the goal's creation point to its target, so "behind/ahead
// of pace" is a real comparison against a real target rather than a
// fabricated pace marker. Monthly breakdown counts real training sessions
// logged per month (Phase 3) alongside the ranking snapshots recorded that
// month.
export default function ProgressTab({ circuit }) {
  const { user } = useAuth();
  const [goals, setGoals] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getRankingGoals(user.id, circuit.category, circuit.subcategory),
      api.getTrainingSessions(user.id, circuit.category, circuit.subcategory),
    ]).then(([g, s]) => { if (!cancelled) { setGoals(g); setSessions(s); } })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load progress'); setGoals([]); setSessions([]); } });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

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

  if (goals === null) return <div className="history-empty">Loading progress…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  const behindPace = activeGoal && chartData.length > 0 && chartData[chartData.length - 1].needed != null
    && chartData[chartData.length - 1].actual < chartData[chartData.length - 1].needed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {behindPace && (
        <div className="perf-chart-card" style={{ borderLeft: '3px solid var(--opp)', margin: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--opp)', flex: 'none' }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            You're currently behind the pace needed to hit your {circuit.category} {circuit.subcategory} goal by {activeGoal.targetDate ? formatDate(activeGoal.targetDate) : 'its target date'}.
          </div>
        </div>
      )}

      <div className="perf-chart-card">
        <div className="perf-chart-title">Actual vs projected points</div>
        <div className="perf-chart-subtitle">{activeGoal ? 'Straight-line projection to your goal' : 'Set a goal in Overview to see a projection line'}</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--border2)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
            <YAxis stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
            <Tooltip labelFormatter={formatDate} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--accent)" strokeWidth={2} dot={false} />
            {activeGoal && <Line type="monotone" dataKey="needed" name="Needed" stroke="var(--opp)" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="perf-chart-card">
        <div className="perf-chart-title">Monthly breakdown</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 10 }}>
            <thead>
              <tr style={{ textAlign: 'right', color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Month</th>
                <th style={{ padding: '6px 8px' }}>Rank</th>
                <th style={{ padding: '6px 8px' }}>Points</th>
                <th style={{ padding: '6px 8px' }}>Training sessions</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map(r => (
                <tr key={r.month} style={{ borderTop: '1px solid var(--border2)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{r.month}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{r.rank ?? '—'}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{r.points ?? '—'}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{r.training}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
