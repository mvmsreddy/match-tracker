import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';
import GoalsPanel from './GoalsPanel';
import MatchDetailModal from './MatchDetailModal';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayLabel(iso, hasDay) {
  if (!iso || !hasDay) return 'TBC';
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return 'Today';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}

function ChartTooltip({ active, payload, label, valueLabel }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-sm border border-border bg-popover text-popover-foreground px-3 py-2 text-xs">
      <div className="font-bold text-sm">{payload[0].value}</div>
      <div className="text-muted-foreground mt-0.5">{valueLabel} &middot; {formatDate(label)}</div>
    </div>
  );
}

// Overview tab — real ranking-snapshot data (rank/points growth), real
// ranking-goal progress (GoalsPanel), and real per-match upcoming/recent data
// resolved by useSegmentMatchSchedule instead of tournament-level entries.
// Clicking a recent-result / upcoming row opens MatchDetailModal with real
// per-match analytics when tracked.
export default function OverviewTab({ circuit, playerId, isOwnDashboard = true, selfName = 'You', onTabChange }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState(null);
  const [segMatches, setSegMatches] = useState(null);
  const [error, setError] = useState('');
  const [modalMatch, setModalMatch] = useState(null);
  const schedule = useSegmentMatchSchedule(playerId, circuit);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries(playerId)
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setSegMatches(data); })
      .catch(() => { if (!cancelled) setSegMatches([]); });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

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
    <div className="space-y-4">
      <GoalsPanel circuit={circuit} playerId={playerId} isOwnDashboard={isOwnDashboard} />

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Matches this month</div>
          <div className="font-display font-extrabold text-xl">{monthStats ? monthStats.matchesThisMonth : '—'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Avg points per match</div>
          <div className="font-display font-extrabold text-xl">{monthStats?.avgPts ?? '—'}</div>
          {monthStats?.avgPtsTrendUp != null && (
            <div className={`text-xs mt-1 ${monthStats.avgPtsTrendUp ? 'text-primary' : 'text-destructive'}`}>
              {monthStats.avgPtsTrendUp ? '▲' : '▼'} vs season average
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Upcoming tournaments</div>
          <div className="font-display font-extrabold text-xl">{entries === null ? '—' : upcomingEntries.length}</div>
          {upcomingEntries.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              next in {Math.max(0, Math.round((new Date(upcomingEntries[0].event.week.startDate) - new Date()) / 86400000))}d
            </div>
          )}
        </Card>
      </div>

      {/* Current rank isn't repeated here — it's always visible in the topbar
          right above, so this row covers what the topbar doesn't. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Current points</div><div className="font-display font-extrabold text-xl">{latest.totalPoints}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Best rank</div><div className="font-display font-extrabold text-xl">{bestRank}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Best points</div><div className="font-display font-extrabold text-xl">{bestPoints}</div></Card>
      </div>

      {rankDelta !== 0 && (
        <div className={`text-xs font-semibold ${rankDelta > 0 ? 'text-primary' : 'text-destructive'}`}>
          {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} since last update &middot; first seen {formatDate(firstSeen)} &middot; {snapshotCount} snapshots
        </div>
      )}

      {/* Points-over-time lives on the Progress Tracker tab (with the goal
          projection line) instead of being duplicated here. */}
      <Card className="p-4 sm:p-6">
        <div className="font-bold text-sm">Ranking Growth</div>
        <div className="text-xs text-muted-foreground mb-3">Lower is better — axis is inverted</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--color-border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke="hsl(var(--color-border))" tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} tickLine={false} minTickGap={40} />
            <YAxis reversed stroke="hsl(var(--color-border))" tick={{ fill: 'hsl(var(--color-muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} allowDecimals={false} />
            <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'hsl(var(--color-border))', strokeDasharray: '3 3' }} />
            <Line type="monotone" dataKey="rank" stroke="hsl(var(--color-chart-3))" strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'hsl(var(--color-card))', strokeWidth: 2, fill: 'hsl(var(--color-chart-3))' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="font-bold text-sm">Upcoming matches</div>
            <div className="text-xs text-muted-foreground">Resolved from your entered draws in this segment</div>
          </div>
          <button className="text-xs font-semibold text-primary hover:underline shrink-0" onClick={() => onTabChange('tournaments')}>Full schedule</button>
        </div>
        {schedule.error && <div className="text-sm text-muted-foreground">{schedule.error}</div>}
        {schedule.loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!schedule.loading && schedule.upcoming.length === 0 && (
          <div className="text-sm text-muted-foreground">No upcoming {circuit.category} {circuit.subcategory} matches found in your entered draws.</div>
        )}
        {schedule.upcoming.length > 0 && (
          <div className="space-y-2">
            {schedule.upcoming.slice(0, 7).map(m => {
              const isToday = m.date === new Date().toISOString().slice(0, 10);
              return (
                <div key={m.id} className={`flex items-center gap-3 p-3 rounded-sm border border-border bg-card border-l-4 ${isToday ? 'border-l-destructive' : 'border-l-blue-400'}`}>
                  <div className="w-14 shrink-0 text-center">
                    <div className={`text-xs font-bold ${isToday ? 'text-destructive' : 'text-blue-400'}`}>{dayLabel(m.date, m.hasDay)}</div>
                    <div className="text-[10px] text-muted-foreground">{m.round || 'TBC'}</div>
                  </div>
                  <div className="flex-1 min-w-32">
                    <div className="text-sm font-semibold">{m.opponentName}</div>
                    <div className="text-xs text-muted-foreground">{m.tournamentName}{m.grade ? ` · ${m.grade}` : ''}</div>
                  </div>
                  <span className="rounded-sm px-2 py-0.5 text-[10px] font-bold bg-blue-400/10 text-blue-400 shrink-0">{m.h2h || 'First meeting'}</span>
                  {isOwnDashboard && (
                    <Button
                      size="sm"
                      onClick={() => navigate('/track', { state: { trackerPrefill: {
                        oppName: m.opponentName, tournament: m.tournamentName, round: m.round || '', date: m.date || '',
                        governingBody: 'AITA', eventMatchId: m.id, normalizedCategory: circuit.category, normalizedSubcategory: circuit.subcategory,
                      } } })}
                    >
                      {isToday ? 'Launch tracker' : 'Prepare'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="font-bold text-sm">Recent results</div>
          <button className="text-xs font-semibold text-primary hover:underline shrink-0" onClick={() => onTabChange('tournaments')}>View all</button>
        </div>
        {!schedule.loading && schedule.recent.length === 0 && (
          <div className="text-sm text-muted-foreground">No completed {circuit.category} {circuit.subcategory} matches found yet.</div>
        )}
        {schedule.recent.length > 0 && (
          <div className="space-y-2">
            {schedule.recent.slice(0, 5).map(m => (
              <button key={m.id} className="w-full flex items-center gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary text-left" onClick={() => setModalMatch(m)}>
                <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold shrink-0 ${m.won ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{m.won ? 'W' : 'L'}</span>
                <div className="flex-1 min-w-32">
                  <div className="text-sm font-semibold">{m.opponentName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.tournamentName} &middot; {m.round} &middot; {formatDate(m.date)}</div>
                </div>
                <div className={`text-sm font-bold shrink-0 ${m.won ? 'text-primary' : 'text-destructive'}`}>{m.score || '—'}</div>
                {m.tracked && <span className="rounded-sm px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary shrink-0">Full stats</span>}
                <div className="text-muted-foreground shrink-0">→</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}

      {modalMatch && (
        <MatchDetailModal match={modalMatch} selfName={selfName} onClose={() => setModalMatch(null)} />
      )}
    </div>
  );
}
