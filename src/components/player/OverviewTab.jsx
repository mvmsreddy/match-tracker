import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';
import GoalsPanel from './GoalsPanel';
import MatchDetailModal from './MatchDetailModal';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { TrendingUp, TrendingDown, Trophy, Calendar, Target, Activity } from 'lucide-react';

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
    
    // Calculate win/loss stats for visualization
    const wins = segMatches.filter(m => m.winner === 'self').length;
    const losses = segMatches.filter(m => m.winner === 'opp').length;
    const winRate = segMatches.length > 0 ? Math.round((wins / segMatches.length) * 100) : 0;
    
    return {
      matchesThisMonth: thisMonth.length,
      avgPts,
      avgPtsTrendUp: avgPts != null && avgPtsThisMonth != null ? avgPtsThisMonth >= avgPts : null,
      wins,
      losses,
      winRate,
      total: segMatches.length,
    };
  }, [segMatches]);

  const { latest, previous, bestRank, bestPoints, firstSeen, snapshotCount } = circuit;
  const rankDelta = previous ? previous.rank - latest.rank : 0;
  
  // Prepare data for win/loss pie chart
  const pieData = monthStats ? [
    { name: 'Wins', value: monthStats.wins, color: 'var(--color-primary)' },
    { name: 'Losses', value: monthStats.losses, color: 'var(--color-destructive)' },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-4 sm:space-y-5">
      <GoalsPanel circuit={circuit} playerId={playerId} isOwnDashboard={isOwnDashboard} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-card">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            {monthStats?.matchesThisMonth > 0 && (
              <span className="text-xs font-bold text-primary">+{monthStats.matchesThisMonth}</span>
            )}
          </div>
          <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">
            {monthStats ? monthStats.matchesThisMonth : '—'}
          </div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Matches this month</div>
        </Card>
        
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-card">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            {monthStats?.avgPtsTrendUp != null && (
              <span className={`text-xs font-bold ${monthStats.avgPtsTrendUp ? 'text-primary' : 'text-destructive'}`}>
                {monthStats.avgPtsTrendUp ? '↑' : '↓'}
              </span>
            )}
          </div>
          <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">
            {monthStats?.avgPts ?? '—'}
          </div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Avg points per match</div>
          {monthStats?.avgPtsTrendUp != null && (
            <div className={`text-xs mt-1.5 font-semibold ${monthStats.avgPtsTrendUp ? 'text-primary' : 'text-destructive'}`}>
              {monthStats.avgPtsTrendUp ? '▲ Improving' : '▼ Needs work'} vs season avg
            </div>
          )}
        </Card>
        
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-primary/10 border-l-4 border-l-primary sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <Trophy className="w-5 h-5 text-primary" />
            {monthStats?.winRate > 50 && (
              <TrendingUp className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter text-primary">
            {entries === null ? '—' : upcomingEntries.length}
          </div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Upcoming tournaments</div>
          {upcomingEntries.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1.5">
              Next in {Math.max(0, Math.round((new Date(upcomingEntries[0].event.week.startDate) - new Date()) / 86400000))} days
            </div>
          )}
        </Card>
      </div>

      {/* Win/Loss Statistics with Pie Chart */}
      {monthStats && monthStats.total > 0 && (
        <Card className="p-4 sm:p-6 shadow-sm">
          <div className="font-bold text-sm mb-4">Match Performance Overview</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="font-display font-extrabold text-3xl tracking-tighter mt-2 text-primary">
                {monthStats.winRate}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div className="flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border-l-4 border-l-primary">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Wins</div>
                  <div className="font-display font-extrabold text-2xl tracking-tighter text-primary mt-0.5">
                    {monthStats.wins}
                  </div>
                </div>
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border-l-4 border-l-destructive">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Losses</div>
                  <div className="font-display font-extrabold text-2xl tracking-tighter text-destructive mt-0.5">
                    {monthStats.losses}
                  </div>
                </div>
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total</div>
                  <div className="font-display font-extrabold text-2xl tracking-tighter mt-0.5">
                    {monthStats.total}
                  </div>
                </div>
                <Target className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Current rank isn't repeated here — it's always visible in the topbar
          right above, so this row covers what the topbar doesn't. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow">
          <div className="text-xs text-muted-foreground mb-1">Current points</div>
          <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tighter">{latest.totalPoints}</div>
        </Card>
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-primary/5">
          <div className="text-xs text-muted-foreground mb-1">Best rank</div>
          <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tighter text-primary">{bestRank}</div>
        </Card>
        <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow col-span-2 lg:col-span-1">
          <div className="text-xs text-muted-foreground mb-1">Best points</div>
          <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tighter">{bestPoints}</div>
        </Card>
      </div>

      {rankDelta !== 0 && (
        <div className={`flex items-center gap-2 text-xs sm:text-sm font-semibold p-3 rounded-lg ${rankDelta > 0 ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
          {rankDelta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} since last update · first seen {formatDate(firstSeen)} · {snapshotCount} snapshots</span>
        </div>
      )}

      {/* Points-over-time lives on the Progress Tracker tab (with the goal
          projection line) instead of being duplicated here. */}
      <Card className="p-4 sm:p-6 shadow-sm">
        <div className="font-bold text-sm sm:text-base mb-1">Ranking Growth</div>
        <div className="text-xs text-muted-foreground mb-4">Lower is better — axis is inverted</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={circuit.points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
              reversed 
              stroke="var(--color-border)" 
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} 
              tickLine={false} 
              axisLine={false} 
              width={44} 
              domain={['auto', 'auto']} 
              allowDecimals={false} 
            />
            <Tooltip content={<ChartTooltip valueLabel="Rank" />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '3 3' }} />
            <Line 
              type="monotone" 
              dataKey="rank" 
              stroke="var(--color-chart-3)" 
              strokeWidth={2.5} 
              dot={false} 
              activeDot={{ r: 6, stroke: 'var(--color-card)', strokeWidth: 2, fill: 'var(--color-chart-3)' }} 
            />
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
