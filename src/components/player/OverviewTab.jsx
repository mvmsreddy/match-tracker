import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';
import GoalsPanel from './GoalsPanel';
import MatchDetailModal from './MatchDetailModal';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayLabel(iso, hasDay) {
  if (!iso || !hasDay) return 'TBC';
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return 'TODAY';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
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

// Overview tab — real ranking-snapshot data (rank/points growth), real
// ranking-goal progress (GoalsPanel, Phase 3), and real per-match upcoming/
// recent data resolved by useSegmentMatchSchedule (cross-referenced against
// the tracker via matches.event_match_id, Phase 4) instead of tournament-
// level entries. Clicking a recent-result / upcoming row opens
// MatchDetailModal with real per-match analytics when tracked.
export default function OverviewTab({ circuit }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState(null);
  const [segMatches, setSegMatches] = useState(null);
  const [error, setError] = useState('');
  const [modalMatch, setModalMatch] = useState(null);
  const schedule = useSegmentMatchSchedule(user.id, circuit);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getMatchesForSegment(user.id, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setSegMatches(data); })
      .catch(() => { if (!cancelled) setSegMatches([]); });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

  const upcomingEntries = useMemo(() => {
    if (!entries) return [];
    const today = new Date().toISOString().slice(0, 10);
    return entries
      .filter(e => e.event && e.event.week?.startDate >= today)
      .filter(e => {
        const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
        return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
      })
      .sort((a, b) => a.event.week.startDate.localeCompare(b.event.week.startDate));
  }, [entries, circuit]);

  const monthStats = useMemo(() => {
    if (!segMatches) return null;
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = segMatches.filter(m => m.date?.startsWith(thisMonthKey));
    const tracked = segMatches.filter(m => m.pointCount);
    const avgPts = tracked.length ? Math.round((tracked.reduce((s, m) => s + m.pointCount, 0) / tracked.length) * 10) / 10 : null;
    const thisMonthTracked = thisMonth.filter(m => m.pointCount);
    const avgPtsThisMonth = thisMonthTracked.length ? thisMonthTracked.reduce((s, m) => s + m.pointCount, 0) / thisMonthTracked.length : null;
    return {
      matchesThisMonth: thisMonth.length,
      avgPts,
      avgPtsTrendUp: avgPts != null && avgPtsThisMonth != null ? avgPtsThisMonth >= avgPts : null,
    };
  }, [segMatches]);

  const { latest, previous, bestRank, bestPoints, firstSeen, snapshotCount } = circuit;
  const rankDelta = previous ? previous.rank - latest.rank : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <GoalsPanel circuit={circuit} />

      <div className="pcd-stat-grid n2">
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Matches this month</div>
          <div className="pcd-stat-card-value">{monthStats ? monthStats.matchesThisMonth : '—'}</div>
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Avg points per match</div>
          <div className="pcd-stat-card-value">{monthStats?.avgPts ?? '—'}</div>
          {monthStats?.avgPtsTrendUp != null && (
            <div className={`pcd-stat-card-trend ${monthStats.avgPtsTrendUp ? 'up' : 'down'}`}>
              {monthStats.avgPtsTrendUp ? '▲' : '▼'} vs season average
            </div>
          )}
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Upcoming tournaments</div>
          <div className="pcd-stat-card-value">{entries === null ? '—' : upcomingEntries.length}</div>
          {upcomingEntries.length > 0 && (
            <div className="pcd-stat-card-trend neutral">
              next in {Math.max(0, Math.round((new Date(upcomingEntries[0].event.week.startDate) - new Date()) / 86400000))}d
            </div>
          )}
        </div>
      </div>

      <div className="pcd-stat-grid n4">
        <div className="pcd-stat-card"><div className="pcd-stat-card-label">Current rank</div><div className="pcd-stat-card-value">{latest.rank}</div></div>
        <div className="pcd-stat-card"><div className="pcd-stat-card-label">Current points</div><div className="pcd-stat-card-value">{latest.totalPoints}</div></div>
        <div className="pcd-stat-card"><div className="pcd-stat-card-label">Best rank</div><div className="pcd-stat-card-value">{bestRank}</div></div>
        <div className="pcd-stat-card"><div className="pcd-stat-card-label">Best points</div><div className="pcd-stat-card-value">{bestPoints}</div></div>
      </div>

      {rankDelta !== 0 && (
        <div className={`perf-circuit-trend ${rankDelta > 0 ? 'up' : 'down'}`}>
          {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} since last update · first seen {formatDate(firstSeen)} · {snapshotCount} snapshots
        </div>
      )}

      <div className="pcd-card">
        <div className="pcd-card-title" style={{ marginBottom: 4 }}>Points Growth</div>
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

      <div className="pcd-card">
        <div className="pcd-card-title">Ranking Growth</div>
        <div className="pcd-card-sub" style={{ marginBottom: 12 }}>Lower is better — axis is inverted</div>
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

      <div className="pcd-card">
        <div className="pcd-card-head">
          <div>
            <div className="pcd-card-title">Upcoming matches</div>
            <div className="pcd-card-sub">Resolved from your entered draws in this segment</div>
          </div>
          <Link to="/tournaments" className="pcd-card-link">FULL SCHEDULE</Link>
        </div>
        {schedule.error && <div className="history-empty">{schedule.error}</div>}
        {schedule.loading && <div className="history-empty">Loading…</div>}
        {!schedule.loading && schedule.upcoming.length === 0 && (
          <div className="history-empty">No upcoming {circuit.category} {circuit.subcategory} matches found in your entered draws.</div>
        )}
        {schedule.upcoming.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {schedule.upcoming.slice(0, 7).map(m => {
              const isToday = m.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={m.id} className="pcd-row" style={{ borderLeftColor: isToday ? 'var(--opp)' : 'var(--info)' }}>
                  <div className="pcd-row-day">
                    <div className="pcd-row-day-label" style={{ color: isToday ? 'var(--opp)' : 'var(--info)' }}>{dayLabel(m.date, m.hasDay)}</div>
                    <div className="pcd-row-time">{m.round || 'TBC'}</div>
                  </div>
                  <div className="pcd-row-main">
                    <div className="pcd-row-title">{m.opponentName}</div>
                    <div className="pcd-row-meta">{m.tournamentName}{m.grade ? ` · ${m.grade}` : ''}</div>
                  </div>
                  <div className="pcd-badge info">{m.h2h || 'FIRST MEETING'}</div>
                  <button
                    className="pcd-btn-primary"
                    onClick={() => navigate('/track', { state: { trackerPrefill: {
                      oppName: m.opponentName, tournament: m.tournamentName, round: m.round || '', date: m.date || '',
                      governingBody: 'AITA', eventMatchId: m.id, normalizedCategory: circuit.category, normalizedSubcategory: circuit.subcategory,
                    } } })}
                  >
                    {isToday ? 'Launch tracker' : 'Prepare'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pcd-card">
        <div className="pcd-card-head">
          <div className="pcd-card-title">Recent results</div>
          <Link to="/tournaments" className="pcd-card-link">VIEW ALL</Link>
        </div>
        {!schedule.loading && schedule.recent.length === 0 && (
          <div className="history-empty">No completed {circuit.category} {circuit.subcategory} matches found yet.</div>
        )}
        {schedule.recent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {schedule.recent.slice(0, 5).map(m => (
              <button key={m.id} className="pcd-result-row" onClick={() => setModalMatch(m)}>
                <div className={`pcd-result-badge ${m.won ? 'win' : 'loss'}`}>{m.won ? 'W' : 'L'}</div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ font: "600 14px/1.2 'Archivo', sans-serif" }}>{m.opponentName}</div>
                  <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 5 }}>
                    {m.tournamentName} · {m.round} · {formatDate(m.date)}
                  </div>
                </div>
                <div className="pcd-result-score" style={{ color: m.won ? 'var(--accent)' : 'var(--opp)' }}>{m.score || '—'}</div>
                {m.tracked && <span className="pcd-badge win sm">FULL STATS</span>}
                <div className="pcd-result-arrow">→</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="history-empty">{error}</div>}

      {modalMatch && (
        <MatchDetailModal match={modalMatch} selfName={user.displayName || 'You'} onClose={() => setModalMatch(null)} />
      )}
    </div>
  );
}
