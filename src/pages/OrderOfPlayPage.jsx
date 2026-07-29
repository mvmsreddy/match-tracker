import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { generateOOPPdf } from '../utils/oopPdf';
import { Button } from '@/components/primitives/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerName(entry) {
  if (!entry) return '—';
  if (entry.isBye) return 'BYE';
  return entry.familyName + (entry.firstName ? ', ' + entry.firstName[0] + '.' : '');
}

function detectConflicts(matches) {
  const conflictIds = new Set();
  const groups = {};

  for (const m of matches) {
    if (m.dayNumber == null || m.matchOrder == null) continue;
    const key = `${m.dayNumber}-${m.matchOrder}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (group.length < 2) continue;

    // Collect all aitaReg values in this slot
    const regCount = {};
    for (const m of group) {
      for (const entry of [m.entry1, m.entry2]) {
        if (!entry || entry.isBye || !entry.aitaReg) continue;
        regCount[entry.aitaReg] = (regCount[entry.aitaReg] || 0) + 1;
      }
    }

    const conflicted = Object.values(regCount).some(c => c >= 2);
    if (conflicted) {
      for (const m of group) conflictIds.add(m.id);
    }
  }

  return conflictIds;
}

const numInputCls = 'w-12 rounded-sm border border-input bg-transparent px-1.5 py-1 text-sm text-center';

// ---------------------------------------------------------------------------
// ScheduleRow — table row with editable day/court/order inputs
// ---------------------------------------------------------------------------

function ScheduleRow({ match, isOwner, hasConflict, onSave }) {
  const [day,   setDay]   = useState(match.dayNumber   ?? '');
  const [court, setCourt] = useState(match.courtNumber ?? '');
  const [order, setOrder] = useState(match.matchOrder  ?? '');
  const [saving, setSaving] = useState(false);

  // Sync if match prop changes (e.g. after auto-schedule reload)
  useEffect(() => {
    setDay(match.dayNumber   ?? '');
    setCourt(match.courtNumber ?? '');
    setOrder(match.matchOrder  ?? '');
  }, [match.id, match.dayNumber, match.courtNumber, match.matchOrder]);

  async function handleBlur() {
    const dayVal   = day   === '' ? null : Number(day);
    const courtVal = court === '' ? null : Number(court);
    const orderVal = order === '' ? null : Number(order);

    // Skip save if nothing changed
    if (
      dayVal   === (match.dayNumber   ?? null) &&
      courtVal === (match.courtNumber ?? null) &&
      orderVal === (match.matchOrder  ?? null)
    ) return;

    setSaving(true);
    try {
      await onSave(match.id, { dayNumber: dayVal, courtNumber: courtVal, matchOrder: orderVal });
    } catch {
      // silently reset on error
      setDay(match.dayNumber   ?? '');
      setCourt(match.courtNumber ?? '');
      setOrder(match.matchOrder  ?? '');
    } finally {
      setSaving(false);
    }
  }

  const drawLabel = match.drawType === 'qualifying' ? 'Q' : 'M';
  const isComplete = match.status === 'complete';

  const p1 = playerName(match.entry1);
  const p2 = playerName(match.entry2);

  return (
    <TableRow className={cn(hasConflict && 'bg-chart-2/5', isComplete && 'opacity-60')}>
      {/* Event / Round */}
      <TableCell>
        <div className="font-semibold">{match.eventAgeGroup} {match.eventCategory}</div>
        <div className="font-mono text-[0.72rem] text-muted-foreground">R{match.round} · #{match.matchSlot} [{drawLabel}]</div>
      </TableCell>

      {/* Players */}
      <TableCell>
        {hasConflict && <span className="text-chart-2 mr-1">⚠</span>}
        {p1} vs {p2}
      </TableCell>

      {/* Day */}
      <TableCell>
        {isOwner ? (
          <input className={numInputCls} type="number" min="1" value={day} onChange={e => setDay(e.target.value)} onBlur={handleBlur} />
        ) : (
          <span>{match.dayNumber ?? '—'}</span>
        )}
      </TableCell>

      {/* Court */}
      <TableCell>
        {isOwner ? (
          <input className={numInputCls} type="number" min="1" value={court} onChange={e => setCourt(e.target.value)} onBlur={handleBlur} />
        ) : (
          <span>{match.courtNumber ?? '—'}</span>
        )}
      </TableCell>

      {/* Match order */}
      <TableCell>
        {isOwner ? (
          <input className={numInputCls} type="number" min="1" value={order} onChange={e => setOrder(e.target.value)} onBlur={handleBlur} />
        ) : (
          <span>{match.matchOrder ?? '—'}</span>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        {saving ? (
          <span className="font-mono text-muted-foreground opacity-60">···</span>
        ) : (
          <span className={cn('inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-semibold', match.status === 'complete' ? 'bg-chart-3/15 text-chart-3' : 'bg-muted text-muted-foreground')}>
            {match.status === 'complete' ? 'Complete' : 'Pending'}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// BoardMatchCard — a match card in board view
// ---------------------------------------------------------------------------

function BoardMatchCard({ match, hasConflict }) {
  const isComplete = match.status === 'complete';
  const drawLabel  = match.drawType === 'qualifying' ? 'Q' : 'M';

  const p1 = playerName(match.entry1);
  const p2 = playerName(match.entry2);

  const p1Won = match.winnerEntryId && match.winnerEntryId === match.entry1Id;
  const p2Won = match.winnerEntryId && match.winnerEntryId === match.entry2Id;

  return (
    <div className={cn('rounded-sm border border-border bg-card p-2.5 mb-2', hasConflict && 'border-chart-2', isComplete && 'opacity-70')}>
      <div className="font-mono text-[0.65rem] text-muted-foreground mb-1.5">
        {match.eventAgeGroup} {match.eventCategory} [{drawLabel}] · R{match.round}
      </div>

      <div className="space-y-0.5">
        <div className={cn('text-sm', p1Won && 'font-bold text-chart-3')}>{p1}</div>
        <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">vs</div>
        <div className={cn('text-sm', p2Won && 'font-bold text-chart-3')}>{p2}</div>
      </div>

      {hasConflict && (
        <div className="mt-1.5 text-[0.68rem] font-semibold text-chart-2">⚠ Player Conflict</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const FILTERS = ['All', 'Unscheduled', 'Scheduled', 'Complete'];

export default function OrderOfPlayPage() {
  const { id: weekId } = useParams();
  const { user } = useAuth();

  const [week,       setWeek]       = useState(null);
  const [matches,    setMatches]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [viewMode,   setViewMode]   = useState('schedule'); // 'schedule' | 'board'
  const [filter,     setFilter]     = useState('All');
  const [numCourts,  setNumCourts]  = useState(3);
  const [scheduling, setScheduling] = useState(false);

  // Board view state
  const [activeDay,  setActiveDay]  = useState(null);

  // Load week + matches
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getTournamentWeek(weekId),
      api.getWeekMatches(weekId),
    ])
      .then(([w, ms]) => {
        if (cancelled) return;
        setWeek(w);
        setMatches(ms);
        setNumCourts(w.numCourts || 3);
        setLoading(false);
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.message || 'Could not load order of play');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [weekId]);

  const isOwner = !!(week && user && week.createdBy === user.id);

  // Conflict detection
  const conflictIds = detectConflicts(matches);

  // Derived stats
  const scheduledCount = matches.filter(
    m => m.dayNumber != null && m.courtNumber != null && m.matchOrder != null
  ).length;
  const conflictCount = conflictIds.size;

  // Unique days for board view
  const days = [...new Set(
    matches
      .filter(m => m.dayNumber != null)
      .map(m => m.dayNumber)
  )].sort((a, b) => a - b);

  // Reset activeDay when days list changes
  useEffect(() => {
    if (days.length > 0 && (activeDay == null || !days.includes(activeDay))) {
      setActiveDay(days[0]);
    }
  }, [days.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered matches for schedule view
  const filteredMatches = matches.filter(m => {
    if (filter === 'All')         return true;
    if (filter === 'Complete')    return m.status === 'complete';
    const isScheduled = m.dayNumber != null && m.courtNumber != null && m.matchOrder != null;
    if (filter === 'Scheduled')   return isScheduled && m.status !== 'complete';
    if (filter === 'Unscheduled') return !isScheduled && m.status !== 'complete';
    return true;
  });

  // Matches on the active day for board view (grouped by court)
  const dayMatches = matches.filter(m => m.dayNumber === activeDay);
  const courts = [...new Set(dayMatches.map(m => m.courtNumber).filter(c => c != null))].sort((a, b) => a - b);

  // Handlers
  async function handleAutoSchedule() {
    setScheduling(true);
    setError('');
    try {
      await api.autoScheduleWeek(weekId, numCourts);
      const ms = await api.getWeekMatches(weekId);
      setMatches(ms);
    } catch (e) {
      setError(e.message || 'Auto-schedule failed');
    } finally {
      setScheduling(false);
    }
  }

  async function handleSaveSchedule(matchId, fields) {
    await api.updateMatchSchedule(matchId, fields);
    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, ...fields } : m)
    );
  }

  // Loading / error states
  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (error && !week) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Link to="/tournaments" className="hover:text-foreground">Tournaments</Link>
            <span>/</span>
            <Link to={`/tournaments/${weekId}`} className="hover:text-foreground">{week?.name}</Link>
            <span>/</span>
            <span className="text-foreground">Order of Play</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Order of Play</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <>
              <label className="flex items-center gap-1.5 text-sm">
                Courts
                <input type="number" min="1" max="50" value={numCourts} onChange={e => setNumCourts(Number(e.target.value))} className={numInputCls} />
              </label>
              <Button onClick={handleAutoSchedule} disabled={scheduling}>{scheduling ? 'Scheduling…' : '⚡ Auto-Schedule'}</Button>
            </>
          )}
          {matches.length > 0 && (
            <Button variant="outline" onClick={() => generateOOPPdf({ week, matches })}>⬇ OOP PDF</Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {matches.length} matches · {scheduledCount} scheduled
          {conflictCount > 0 && <span className="text-chart-2 font-semibold ml-2">⚠ {conflictCount} conflicts</span>}
        </div>
        <div className="inline-flex border border-border rounded-sm p-1 bg-card">
          {['schedule', 'board'].map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold capitalize', viewMode === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Error line */}
      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Empty state */}
      {matches.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No matches found. Generate brackets for events in this tournament first.
        </div>
      ) : viewMode === 'schedule' ? (
        /* ------------------------------------------------------------------ */
        /* SCHEDULE VIEW                                                        */
        /* ------------------------------------------------------------------ */
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex items-center justify-between">
            <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', filter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="rounded-sm border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event / Round</TableHead>
                  <TableHead>Matchup</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Ct</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.map(m => (
                  <ScheduleRow
                    key={m.id}
                    match={m}
                    isOwner={isOwner}
                    hasConflict={conflictIds.has(m.id)}
                    onSave={handleSaveSchedule}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* BOARD VIEW                                                           */
        /* ------------------------------------------------------------------ */
        <div>
          {days.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No scheduled matches yet.</div>
          ) : (
            <>
              {/* Day tabs */}
              <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card mb-4">
                {days.map(d => (
                  <button
                    key={d}
                    onClick={() => setActiveDay(d)}
                    className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeDay === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Day {d}
                  </button>
                ))}
              </div>

              {/* Court columns */}
              {courts.length === 0 ? (
                <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No matches scheduled for Day {activeDay}.</div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {courts.map(courtNum => {
                    const courtMatches = dayMatches
                      .filter(m => m.courtNumber === courtNum)
                      .sort((a, b) => (a.matchOrder ?? 0) - (b.matchOrder ?? 0));

                    return (
                      <div key={courtNum} className="w-56 shrink-0">
                        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Court {courtNum}</div>
                        {courtMatches.map(m => (
                          <BoardMatchCard
                            key={m.id}
                            match={m}
                            hasConflict={conflictIds.has(m.id)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
