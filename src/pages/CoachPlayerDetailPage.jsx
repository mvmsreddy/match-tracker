import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import * as api from '../api';
import { aggregateStrokeBreakdown, aggregateBreakPoints, strokeWinRates } from '../lib/segmentAnalytics';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Coach's read-only view of one linked player, per segment. Note this is a
// genuinely separate component from the player-side tabs (OverviewTab,
// TrainingLogTab, etc.) rather than a forced reuse of them — those all read
// the CURRENT logged-in user via useAuth() internally, whereas a coach here
// is viewing a DIFFERENT player's data by id, so the underlying data-layer
// calls (getRankingGoals, getTrainingSessions, getMatchesForSegment) are
// reused directly (they already take an explicit playerId), but the UI is
// its own condensed, coach-appropriate summary rather than a full tab set.
export default function CoachPlayerDetailPage() {
  const { playerId } = useParams();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [player, setPlayer] = useState(null);
  const [selectedSegmentKey, setSelectedSegmentKey] = useState(null);
  const [goals, setGoals] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState(false);
  const [logForm, setLogForm] = useState({ sessionDate: new Date().toISOString().slice(0, 10), durationMinutes: '', focusAreas: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getRosterWithSegments(user.id)
      .then(roster => {
        if (cancelled) return;
        const found = roster.find(r => r.id === playerId);
        setPlayer(found || null);
        if (found?.segments.length > 0) setSelectedSegmentKey(found.segments[0].key);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load player'); });
    return () => { cancelled = true; };
  }, [user.id, playerId]);

  const segment = player?.segments.find(s => s.key === selectedSegmentKey) || null;

  useEffect(() => {
    if (!segment) return;
    let cancelled = false;
    setGoals(null); setSessions(null); setMatches(null);
    Promise.all([
      api.getRankingGoals(playerId, segment.category, segment.subcategory),
      api.getTrainingSessions(playerId, segment.category, segment.subcategory),
      api.getMatchesForSegment(playerId, segment.category, segment.subcategory),
    ]).then(([g, s, m]) => { if (!cancelled) { setGoals(g); setSessions(s); setMatches(m); } })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load segment data'); });
    return () => { cancelled = true; };
  }, [playerId, segment]);

  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);
  const winRates = useMemo(() => (tracked.length > 0 ? strokeWinRates(aggregateStrokeBreakdown(tracked)) : []), [tracked]);
  const bp = useMemo(() => (tracked.length > 0 ? aggregateBreakPoints(tracked) : null), [tracked]);
  const activeGoal = (goals || []).find(g => g.status === 'active');

  async function handleLogSession() {
    if (!segment) return;
    setSaving(true);
    try {
      const created = await api.logTrainingSession(playerId, {
        category: segment.category,
        subcategory: segment.subcategory,
        sessionDate: logForm.sessionDate,
        durationMinutes: logForm.durationMinutes ? Number(logForm.durationMinutes) : null,
        focusAreas: logForm.focusAreas.split(',').map(s => s.trim()).filter(Boolean),
        notes: logForm.notes || null,
      });
      setSessions(prev => [created, ...(prev || [])]);
      setLogForm({ sessionDate: new Date().toISOString().slice(0, 10), durationMinutes: '', focusAreas: '', notes: '' });
      setLogging(false);
    } catch (e) {
      setError(e.message || 'Could not log session');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="roster" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">{player?.displayName || 'Player'}</h1>
            <div className="subtitle">Coach view · read-only</div>
          </div>
          <Link to="/my-players" className="action-btn">← Roster</Link>
        </div>
      </div>

      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}
        {!player && !error && <div className="history-empty">Loading player…</div>}

        {player && player.segments.length === 0 && (
          <div className="history-empty">No ranking history found for this player yet.</div>
        )}

        {player && player.segments.length > 0 && (
          <>
            <div className="perf-body-row">
              {player.segments.map(s => (
                <button key={s.key} className={`perf-body-pill${selectedSegmentKey === s.key ? ' active' : ''}`} onClick={() => setSelectedSegmentKey(s.key)}>
                  {s.category} {s.subcategory}
                </button>
              ))}
            </div>

            {segment && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
                <div className="perf-stat-strip">
                  <div className="perf-stat"><div className="perf-stat-value">{segment.latest.rank}</div><div className="perf-stat-label">Current Rank</div></div>
                  <div className="perf-stat"><div className="perf-stat-value">{segment.latest.totalPoints}</div><div className="perf-stat-label">Current Points</div></div>
                  <div className="perf-stat"><div className="perf-stat-value">{segment.bestRank}</div><div className="perf-stat-label">Best Rank</div></div>
                  <div className="perf-stat"><div className="perf-stat-value">{tracked.length}</div><div className="perf-stat-label">Tracked Matches</div></div>
                </div>

                <div className="perf-chart-card">
                  <div className="perf-chart-title">Goal</div>
                  {activeGoal
                    ? <div style={{ padding: '10px 6px' }}>Target: {activeGoal.targetRank ? `Top ${activeGoal.targetRank}` : `${activeGoal.targetPoints} points`}{activeGoal.targetDate ? ` by ${formatDate(activeGoal.targetDate)}` : ''}</div>
                    : <div className="history-empty">No active goal set by this player for this segment.</div>}
                </div>

                <div className="perf-chart-card">
                  <div className="perf-chart-title">Stroke win rates (tracked matches)</div>
                  {winRates.filter(w => w.winRate !== null).length === 0 && <div className="history-empty">Not enough tracked matches yet.</div>}
                  {winRates.filter(w => w.winRate !== null).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 6px' }}>
                      {winRates.filter(w => w.winRate !== null).map(w => (
                        <div key={w.stroke}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span>{w.stroke}</span>
                            <span style={{ fontWeight: 700, color: w.winRate >= 50 ? 'var(--accent)' : 'var(--opp)' }}>{w.winRate}%</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden', marginTop: 6 }}>
                            <div style={{ width: `${w.winRate}%`, height: '100%', background: w.winRate >= 50 ? 'var(--accent)' : 'var(--opp)' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {bp && (bp.facedServing >= 5 || bp.facedReturning >= 5) && (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text2)' }}>
                      Break points: {bp.saveRate !== null && `${bp.saveRate}% saved serving`}{bp.saveRate !== null && bp.convertRate !== null ? ' · ' : ''}{bp.convertRate !== null && `${bp.convertRate}% converted returning`}
                    </div>
                  )}
                </div>

                <div className="perf-chart-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="perf-chart-title">Recent training</div>
                    <button className="action-btn" onClick={() => setLogging(v => !v)}>{logging ? 'Cancel' : 'Log a session'}</button>
                  </div>

                  {logging && (
                    <div style={{ padding: '14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <input type="date" value={logForm.sessionDate} onChange={e => setLogForm(f => ({ ...f, sessionDate: e.target.value }))}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
                        <input type="number" placeholder="Duration (min)" value={logForm.durationMinutes} onChange={e => setLogForm(f => ({ ...f, durationMinutes: e.target.value }))}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', width: 130 }} />
                        <input type="text" placeholder="Focus areas (comma-separated)" value={logForm.focusAreas} onChange={e => setLogForm(f => ({ ...f, focusAreas: e.target.value }))}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', flex: 1, minWidth: 180 }} />
                      </div>
                      <textarea rows={2} placeholder="Notes visible to the player" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', resize: 'vertical' }} />
                      <button className="action-btn primary" disabled={saving} onClick={handleLogSession} style={{ alignSelf: 'flex-start' }}>
                        {saving ? 'Saving…' : 'Save session'}
                      </button>
                    </div>
                  )}

                  {sessions === null && <div className="history-empty">Loading…</div>}
                  {sessions !== null && sessions.length === 0 && <div className="history-empty">No training sessions logged for this segment yet.</div>}
                  {sessions && sessions.slice(0, 8).map(s => (
                    <div key={s.id} style={{ display: 'flex', gap: 12, padding: '10px 6px', borderTop: '1px solid var(--border2)' }}>
                      <div style={{ width: 70, fontSize: 12, color: 'var(--text3)' }}>{formatDate(s.sessionDate)}</div>
                      <div style={{ flex: 1, fontSize: 13 }}>{(s.focusAreas || []).join(', ') || 'General session'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
