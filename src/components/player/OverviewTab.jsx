import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import GoalsPanel from './GoalsPanel';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ChartTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="perf-tooltip">
      <div className="perf-tooltip-value">{payload[0].value}</div>
      <div className="perf-tooltip-label">{valueLabel} · {formatDate(label)}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="perf-stat">
      <div className="perf-stat-value">{value}</div>
      <div className="perf-stat-label">{label}</div>
    </div>
  );
}

// Overview tab — real ranking-snapshot data (rank/points growth), real
// ranking-goal progress (GoalsPanel, Phase 3), plus segment-filtered
// upcoming tournament entries. Per-match "recent results"/"upcoming matches"
// (as opposed to tournament-level entries) needs resolving event_matches
// against this player's own entry id per event, which the Tournaments tab
// (with a link into the existing EventDetailPage) already covers — not
// duplicated here.
export default function OverviewTab({ circuit }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, []);

  const upcoming = useMemo(() => {
    if (!entries) return [];
    const today = new Date().toISOString().slice(0, 10);
    return entries
      .filter(e => e.event && e.event.week?.startDate >= today)
      .filter(e => {
        const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
        return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
      })
      .sort((a, b) => a.event.week.startDate.localeCompare(b.event.week.startDate))
      .slice(0, 7);
  }, [entries, circuit]);

  const { latest, previous, bestRank, bestPoints, firstSeen, snapshotCount } = circuit;
  const rankDelta = previous ? previous.rank - latest.rank : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="perf-stat-strip">
        <Stat label="Current Rank" value={latest.rank} />
        <Stat label="Current Points" value={latest.totalPoints} />
        <Stat label="Best Rank" value={bestRank} />
        <Stat label="Best Points" value={bestPoints} />
        <Stat label="First Seen" value={formatDate(firstSeen)} />
        <Stat label="Snapshots" value={snapshotCount} />
      </div>

      {rankDelta !== 0 && (
        <div className={`perf-circuit-trend ${rankDelta > 0 ? 'up' : 'down'}`}>
          {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} since last update
        </div>
      )}

      <div className="perf-chart-card">
        <div className="perf-chart-title">Points Growth</div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--border2)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
            <YAxis stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
            <Tooltip content={<ChartTooltip valueLabel="Points" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="totalPoints" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--accent)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="perf-chart-card">
        <div className="perf-chart-title">Ranking Growth</div>
        <div className="perf-chart-subtitle">Lower is better — axis is inverted</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--border2)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} minTickGap={40} />
            <YAxis reversed stroke="var(--border)" tick={{ fill: 'var(--text4)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
            <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
            <Line type="monotone" dataKey="rank" stroke="var(--win)" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--bg2)', strokeWidth: 2, fill: 'var(--win)' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <GoalsPanel circuit={circuit} />

      <div className="perf-chart-card">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div className="perf-chart-title">Upcoming tournaments</div>
          <Link to="/tournaments">FULL SCHEDULE</Link>
        </div>
        {error && <div className="history-empty">{error}</div>}
        {entries === null && !error && <div className="history-empty">Loading…</div>}
        {entries !== null && upcoming.length === 0 && (
          <div className="history-empty">No upcoming {circuit.category} {circuit.subcategory} entries.</div>
        )}
        {upcoming.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(e => (
              <Link
                key={e.id}
                to={`/tournaments/${e.event.week.id}/events/${e.event.id}`}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, background: 'var(--bg3)', color: 'inherit' }}
              >
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700 }}>{e.event.week.name}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 6 }}>{formatDate(e.event.week.startDate)} · {e.event.week.city}, {e.event.week.stateAbbr}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.event.week.grade}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
