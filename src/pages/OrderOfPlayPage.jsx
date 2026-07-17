import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

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
    <tr
      className={
        'oop-row' +
        (hasConflict ? ' oop-row-conflict' : '') +
        (isComplete  ? ' oop-row-done'     : '')
      }
    >
      {/* Event / Round */}
      <td className="oop-td-event">
        <div style={{ fontWeight: 600 }}>
          {match.eventAgeGroup} {match.eventCategory}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', opacity: 0.7 }}>
          R{match.round} · #{match.matchSlot} [{drawLabel}]
        </div>
      </td>

      {/* Players */}
      <td>
        <span>
          {hasConflict && <span style={{ color: '#f59e0b', marginRight: 4 }}>⚠</span>}
          {p1} vs {p2}
        </span>
      </td>

      {/* Day */}
      <td>
        {isOwner ? (
          <input
            className="oop-num-input"
            type="number"
            min="1"
            style={{ width: 42 }}
            value={day}
            onChange={e => setDay(e.target.value)}
            onBlur={handleBlur}
          />
        ) : (
          <span>{match.dayNumber ?? '—'}</span>
        )}
      </td>

      {/* Court */}
      <td>
        {isOwner ? (
          <input
            className="oop-num-input"
            type="number"
            min="1"
            style={{ width: 42 }}
            value={court}
            onChange={e => setCourt(e.target.value)}
            onBlur={handleBlur}
          />
        ) : (
          <span>{match.courtNumber ?? '—'}</span>
        )}
      </td>

      {/* Match order */}
      <td>
        {isOwner ? (
          <input
            className="oop-num-input"
            type="number"
            min="1"
            style={{ width: 42 }}
            value={order}
            onChange={e => setOrder(e.target.value)}
            onBlur={handleBlur}
          />
        ) : (
          <span>{match.matchOrder ?? '—'}</span>
        )}
      </td>

      {/* Status */}
      <td>
        {saving ? (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', opacity: 0.5 }}>···</span>
        ) : (
          <span className={`t-status-badge t-status-${match.status}`}>
            {match.status === 'complete' ? 'Complete' : 'Pending'}
          </span>
        )}
      </td>
    </tr>
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
    <div
      className={
        'oop-card' +
        (hasConflict ? ' oop-card-conflict' : '') +
        (isComplete  ? ' oop-card-done'     : '')
      }
    >
      <div className="oop-card-event">
        {match.eventAgeGroup} {match.eventCategory} [{drawLabel}] · R{match.round}
      </div>

      <div className="oop-card-players">
        <div className={'oop-player' + (p1Won ? ' oop-player-won' : '')}>{p1}</div>
        <div className="oop-vs">vs</div>
        <div className={'oop-player' + (p2Won ? ' oop-player-won' : '')}>{p2}</div>
      </div>

      {hasConflict && (
        <div className="oop-conflict-badge">⚠ Player Conflict</div>
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
      <div className="root">
        <TopNav />
        <div className="page-scroll">
          <div className="history-empty">Loading…</div>
        </div>
      </div>
    );
  }

  if (error && !week) {
    return (
      <div className="root">
        <TopNav />
        <div className="page-scroll">
          <div className="history-empty">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="root">
      <TopNav />

      {/* Header */}
      <div className="header">
        <div className="title-row">
          <div>
            <div className="t-breadcrumb">
              <Link to="/tournaments">Tournaments</Link>
              <span> / </span>
              <Link to={`/tournaments/${weekId}`}>{week?.name}</Link>
              <span> / </span>
              <span>Order of Play</span>
            </div>
            <h1 className="title">Order of Play</h1>
            <div className="subtitle">{week?.name}</div>
          </div>

          {isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                Courts
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={numCourts}
                  onChange={e => setNumCourts(Number(e.target.value))}
                  style={{ width: 48 }}
                  className="oop-num-input"
                />
              </label>
              <button
                className="action-btn primary"
                onClick={handleAutoSchedule}
                disabled={scheduling}
              >
                {scheduling ? 'Scheduling…' : '⚡ Auto-Schedule'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="t-view-bar">
        <div className="t-view-stats">
          <span>{matches.length} matches · {scheduledCount} scheduled</span>
          {conflictCount > 0 && (
            <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ {conflictCount} conflicts</span>
          )}
        </div>
        <div className="t-view-toggle">
          <button
            className={'t-vtab' + (viewMode === 'schedule' ? ' active' : '')}
            onClick={() => setViewMode('schedule')}
          >
            Schedule
          </button>
          <button
            className={'t-vtab' + (viewMode === 'board' ? ' active' : '')}
            onClick={() => setViewMode('board')}
          >
            Board
          </button>
        </div>
      </div>

      {/* Error line */}
      {error && (
        <div style={{ padding: '6px 16px', color: '#e05252', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {matches.length === 0 ? (
        <div className="page-scroll">
          <div className="history-empty">
            No matches found. Generate brackets for events in this tournament first.
          </div>
        </div>
      ) : viewMode === 'schedule' ? (
        /* ------------------------------------------------------------------ */
        /* SCHEDULE VIEW                                                        */
        /* ------------------------------------------------------------------ */
        <div className="page-scroll">
          {/* Filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map(f => (
                <button
                  key={f}
                  className={'oop-filter-btn' + (filter === f ? ' active' : '')}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {filteredMatches.length} match{filteredMatches.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="t-entry-table-wrap">
            <table className="t-entry-table">
              <thead>
                <tr>
                  <th>Event / Round</th>
                  <th>Matchup</th>
                  <th>Day</th>
                  <th>Ct</th>
                  <th>#</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map(m => (
                  <ScheduleRow
                    key={m.id}
                    match={m}
                    isOwner={isOwner}
                    hasConflict={conflictIds.has(m.id)}
                    onSave={handleSaveSchedule}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* BOARD VIEW                                                           */
        /* ------------------------------------------------------------------ */
        <div className="page-scroll">
          {days.length === 0 ? (
            <div className="history-empty">No scheduled matches yet.</div>
          ) : (
            <>
              {/* Day tabs */}
              <div className="oop-day-tabs">
                {days.map(d => (
                  <button
                    key={d}
                    className={'oop-day-tab' + (activeDay === d ? ' active' : '')}
                    onClick={() => setActiveDay(d)}
                  >
                    Day {d}
                  </button>
                ))}
              </div>

              {/* Court columns */}
              {courts.length === 0 ? (
                <div className="history-empty">No matches scheduled for Day {activeDay}.</div>
              ) : (
                <div className="oop-board">
                  {courts.map(courtNum => {
                    const courtMatches = dayMatches
                      .filter(m => m.courtNumber === courtNum)
                      .sort((a, b) => (a.matchOrder ?? 0) - (b.matchOrder ?? 0));

                    return (
                      <div key={courtNum} className="oop-court-col" style={{ width: 220 }}>
                        <div className="oop-court-header">Court {courtNum}</div>
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
