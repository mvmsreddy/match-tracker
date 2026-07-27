import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
const ROSTER_COLS = 'minmax(140px,1fr) 60px 60px 128px 84px 118px 130px';
import { useAuth } from '../../context/AuthContext';
import { computeRankProgress } from '../../lib/segments';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

// One roster row's real form/training/pace — fetched independently per row
// (small roster sizes, same "each component owns its slice" pattern the
// player-side tabs already use) rather than one giant fan-out at the top.
function RosterRow({ player }) {
  const seg = player.segments[0]; // most-recently-updated segment (segments.js sorts most-recent-first)
  const [recent, setRecent] = useState(null);
  const [goal, setGoal] = useState(null);
  const [hours30d, setHours30d] = useState(null);

  useEffect(() => {
    if (!seg) { setRecent([]); setGoal(null); setHours30d(0); return; }
    let cancelled = false;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    Promise.all([
      api.getMatchesForSegment(player.id, seg.category, seg.subcategory),
      api.getRankingGoals(player.id, seg.category, seg.subcategory),
      api.getTrainingSessions(player.id, seg.category, seg.subcategory),
    ]).then(([matches, goals, sessions]) => {
      if (cancelled) return;
      const tracked = (matches || []).filter(m => m.points?.length > 0).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setRecent(tracked.slice(0, 5).map(m => m.winner === 'self'));
      setGoal((goals || []).find(g => g.status === 'active') || null);
      const mins = (sessions || []).filter(s => s.sessionDate >= cutoffIso).reduce((s, r) => s + (r.durationMinutes || 0), 0);
      setHours30d(Math.round(mins / 60));
    }).catch(() => { if (!cancelled) { setRecent([]); setGoal(null); setHours30d(0); } });
    return () => { cancelled = true; };
  }, [player.id, seg]);

  let paceLabel = '—', paceOn = null;
  if (seg && goal?.targetRank) {
    const progress = computeRankProgress(seg.points[0]?.rank, seg.latest.rank, goal.targetRank);
    if (progress != null) {
      paceOn = true;
      if (goal.targetDate) {
        const startMs = new Date(seg.points[0].date).getTime();
        const endMs = new Date(goal.targetDate).getTime();
        if (endMs > startMs) {
          const elapsedPct = Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100);
          paceOn = progress >= elapsedPct - 3;
        }
      }
      paceLabel = paceOn ? 'ON PACE' : 'BEHIND';
    }
  }

  return (
    <div className="pcd-grid-body-row" style={{ gridTemplateColumns: ROSTER_COLS, minWidth: 820 }}>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 11px/1 'IBM Plex Mono', monospace", color: 'var(--info)' }}>{initials(player.displayName)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 14px/1.2 'Archivo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.displayName}</div>
          <div style={{ font: "400 10px/1.3 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 5, whiteSpace: 'nowrap' }}>{seg ? `${seg.category} ${seg.subcategory}` : 'NO SEGMENT'}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', font: "700 15px/1 'IBM Plex Mono', monospace" }}>{seg ? seg.latest.rank : '—'}</div>
      <div style={{ textAlign: 'right', font: "500 13px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>{goal?.targetRank ?? '—'}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {recent === null ? <span style={{ font: "400 11px/1 'IBM Plex Mono', monospace", color: 'var(--text3)' }}>…</span> :
          recent.length === 0 ? <span style={{ font: "400 11px/1 'IBM Plex Mono', monospace", color: 'var(--text3)' }}>—</span> :
          recent.map((won, i) => (
            <span key={i} style={{ width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 10px/1 'IBM Plex Mono', monospace", background: won ? 'rgba(198,226,61,.16)' : 'rgba(255,107,90,.16)', color: won ? 'var(--accent)' : 'var(--opp)' }}>{won ? 'W' : 'L'}</span>
          ))}
      </div>
      <div style={{ textAlign: 'right', font: "500 12px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>{hours30d == null ? '—' : `${hours30d}h`}</div>
      <div style={{ textAlign: 'right', font: "600 11px/1 'IBM Plex Mono', monospace", letterSpacing: '.06em', color: paceOn == null ? 'var(--text3)' : (paceOn ? 'var(--accent)' : 'var(--opp)') }}>{paceLabel}</div>
      <div style={{ justifySelf: 'end' }}>
        <Link to={`/coach/players/${player.id}/dashboard`} className="pcd-btn-secondary" style={{ display: 'inline-block', fontSize: 11, letterSpacing: '.06em' }}>DASHBOARD →</Link>
      </div>
    </div>
  );
}

// Roster + the real link-management flow (search/send/accept/decline/unlink
// — unchanged from the old CoachPlayersPage, just relocated here since a
// coach's landing page is now this one, not that one). Each row links to
// the real Player Coaching Dashboard (/coach/players/:id/dashboard) — the
// same Overview/Tournaments/Training/Analytics/Recommendations/Progress a
// player sees for themselves, per the design's own claim.
export default function RosterView({ roster }) {
  const { user } = useAuth();
  const [links, setLinks] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadLinks = useCallback(() => {
    api.getCoachLinks(user.id).then(setLinks).catch(() => setLinks([]));
  }, [user.id]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const pending = (links || []).filter(l => l.status === 'pending' && l.coachId === user.id);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setActionError('');
    try {
      const results = await api.searchPlayers(searchQuery);
      const linkedIds = new Set((links || []).map(l => l.playerId));
      setSearchResults(results.filter(p => !linkedIds.has(p.id) && p.id !== user.id));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleSendRequest(playerId) {
    setActionError('');
    try {
      await api.sendCoachRequest(user.id, playerId);
      setSearchResults(prev => prev.filter(p => p.id !== playerId));
      loadLinks();
    } catch (err) {
      setActionError(err.message || 'Could not send request');
    }
  }

  async function handleUnlink(linkId) {
    if (!window.confirm('Remove this link?')) return;
    try {
      await api.deleteCoachLink(linkId);
      loadLinks();
    } catch (err) {
      setActionError(err.message || 'Could not remove link');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button className="pcd-btn-secondary" onClick={() => setShowSearch(v => !v)}>{showSearch ? 'Close' : '+ Find a player'}</button>
        {pending.length > 0 && <div className="pcd-badge info">{pending.length} PENDING</div>}
      </div>

      {actionError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{actionError}</div>}

      {showSearch && (
        <div className="pcd-card">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or AITA reg…"
              style={{ flex: 1, minWidth: 200, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }}
            />
            <button className="pcd-btn-primary" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>{searching ? 'Searching…' : 'Search'}</button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {searchResults.map(p => (
                <div key={p.id} className="pcd-entry-row">
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ font: "600 14px/1.2 'Archivo', sans-serif" }}>{p.displayName}</div>
                    <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 6 }}>
                      {[p.aitaReg, p.stateAbbr, p.ranking && `Rank ${p.ranking}`, p.clubName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button className="pcd-btn-primary" onClick={() => handleSendRequest(p.id)}>Send request</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 12 }}>Sent requests</div>
          {pending.map(l => (
            <div key={l.id} className="pcd-entry-row">
              <div style={{ flex: 1, font: "600 14px/1.2 'Archivo', sans-serif" }}>{l.player?.displayName || '—'}</div>
              <div className="pcd-badge">AWAITING RESPONSE</div>
              <button className="pcd-btn-secondary" onClick={() => handleUnlink(l.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div className="pcd-hscroll-table">
        <div className="pcd-grid-head-row" style={{ gridTemplateColumns: ROSTER_COLS, minWidth: 820 }}>
          <div>Player</div><div style={{ textAlign: 'right' }}>Rank</div><div style={{ textAlign: 'right' }}>Goal</div>
          <div>Recent form</div><div style={{ textAlign: 'right' }}>Training</div><div style={{ textAlign: 'right' }}>Pace</div><div />
        </div>
        {roster.length === 0 && <div className="history-empty">No players linked yet — use "Find a player" above.</div>}
        {roster.map(p => <RosterRow key={p.id} player={p} />)}
      </div>

      <div style={{ font: "400 12px/1.5 'Archivo', sans-serif", color: 'var(--text3)', maxWidth: '76ch' }}>
        Opening a player's dashboard gives you their full Overview, Tournaments, Training, Analytics, Recommendations
        and Progress — the same view they see, read-only.
      </div>
    </div>
  );
}
