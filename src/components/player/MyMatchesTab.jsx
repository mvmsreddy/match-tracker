import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from '../../lib/analytics';
import MatchDetailModal from './MatchDetailModal';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRatio(r) { return r === Infinity ? '∞' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

function buildComparisonRows(matches) {
  const perMatch = matches.map(m => {
    const cfgOpts = { sessionType: m.sessionType, formatPreset: m.formatPreset, pointTarget: m.pointTarget };
    const stats = computeStats(m.points);
    const serve = computeServeStats(m.points, 'self');
    const ret = computeReturnStats(m.points, 'self');
    const analytics = replayMatchAnalytics(m.points, cfgOpts);
    return { m, stats, serve, ret, analytics };
  });

  return [
    { label: 'Score', values: perMatch.map(x => x.m.scoreSummary || '—') },
    { label: 'Winner', values: perMatch.map(x => (x.m.winner === 'self' ? x.m.selfName : (x.m.winner === 'opp' ? x.m.oppName : 'In progress'))) },
    { label: 'Winners/Forced Errors', values: perMatch.map(x => x.stats.self.wfe) },
    { label: 'Unforced Errors', values: perMatch.map(x => x.stats.self.ue) },
    { label: 'W/FE : UE Ratio', values: perMatch.map(x => fmtRatio(x.stats.self.ratio)) },
    { label: 'Points Won', values: perMatch.map(x => x.stats.self.pointCount) },
    { label: 'Aces', values: perMatch.map(x => x.serve.aces) },
    { label: 'Double Faults', values: perMatch.map(x => x.serve.dfs) },
    { label: '1st Serve %', values: perMatch.map(x => fmtPct(x.serve.firstPct)) },
    { label: 'Break Points Saved', values: perMatch.map(x => `${x.analytics.bp.self.savedServing}/${x.analytics.bp.self.facedServing}`) },
    { label: 'Break Points Won', values: perMatch.map(x => `${x.analytics.bp.self.wonReturning}/${x.analytics.bp.self.facedReturning}`) },
    { label: 'Return Winners/Forced', values: perMatch.map(x => x.ret.retWinnersForced) },
  ];
}

// Merges the old standalone /history (flat match+practice list) and /compare
// (multi-match side-by-side diff) pages into one dashboard tab — neither is
// segment-scoped by design (a player's tracked matches span every category
// they've played), unlike every other tab here. Uses `playerId` throughout
// (not the logged-in user directly) so this also works correctly when a
// coach is viewing a linked player's dashboard — the old pages always read
// `user.id`, which would have silently shown the COACH's own matches (or
// nothing) instead of the viewed player's.
export default function MyMatchesTab({ playerId, isOwnDashboard = true }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareDetails, setCompareDetails] = useState({});
  const [comparing, setComparing] = useState(false);
  const [modalMatch, setModalMatch] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setMatches(null);
    api.listMatches(playerId)
      .then(list => { if (!cancelled) setMatches(list); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load match history'); setMatches([]); } });
    return () => { cancelled = true; };
  }, [playerId]);

  function toggleSelect(id) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  async function handleDelete(matchId) {
    if (!window.confirm('Delete this saved match? This cannot be undone.')) return;
    await api.deleteMatch(playerId, matchId);
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setSelectedIds(prev => prev.filter(id => id !== matchId));
  }

  async function loadComparison() {
    setComparing(true);
    setError('');
    try {
      const results = await Promise.all(selectedIds.map(id => api.getMatch(playerId, id)));
      const byId = {};
      results.forEach(m => { byId[m.id] = m; });
      setCompareDetails(byId);
    } catch (e) {
      setError(e.message || 'Could not load selected matches');
    } finally {
      setComparing(false);
    }
  }

  async function openMatch(m) {
    setOpeningId(m.id);
    try {
      const full = await api.getMatch(playerId, m.id);
      setModalMatch({
        opponentName: m.oppName,
        selfName: m.selfName,
        tournamentName: m.tournament,
        round: full.round,
        date: m.date,
        score: m.scoreSummary,
        won: m.winner === 'self',
        tracked: true,
        trackedMatch: full,
      });
    } catch (e) {
      setError(e.message || 'Could not load this match');
    } finally {
      setOpeningId(null);
    }
  }

  const selectedMatches = selectedIds.map(id => compareDetails[id]).filter(Boolean);
  const comparisonRows = useMemo(() => (selectedMatches.length > 0 ? buildComparisonRows(selectedMatches) : []), [selectedMatches]);

  if (matches === null) return <div className="history-empty">Loading match history…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="t-info-item">{matches.length} saved match{matches.length === 1 ? '' : 'es'} &amp; practice sessions</div>

      {error && <div className="history-empty">{error}</div>}

      {matches.length === 0 && (
        <div className="history-empty">No matches saved yet. Generate a PDF report from the Tracker page to save a match here.</div>
      )}

      {matches.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map(m => {
              const hasResult = m.winner === 'self' || m.winner === 'opp';
              return (
                <div key={m.id} className="pcd-result-row" style={{ cursor: hasResult ? 'pointer' : 'default' }} onClick={() => hasResult && openMatch(m)}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(m.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelect(m.id)}
                  />
                  <div className={`pcd-result-badge ${m.winner === 'self' ? 'win' : m.winner === 'opp' ? 'loss' : ''}`}>
                    {m.winner === 'self' ? 'W' : m.winner === 'opp' ? 'L' : (m.sessionType === 'practice' ? 'PR' : '–')}
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ font: "600 14px/1.2 'Archivo', sans-serif" }}>{m.selfName} vs {m.oppName}</div>
                    <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 5 }}>
                      {m.tournament ? `${m.tournament} · ` : ''}{formatDate(m.date)}{m.sessionType === 'practice' ? ' · Practice' : ''}
                    </div>
                  </div>
                  <div className="pcd-result-score">{m.scoreSummary || '—'}</div>
                  {isOwnDashboard && (
                    <button
                      className="pcd-btn-secondary"
                      onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                    >
                      Delete
                    </button>
                  )}
                  {hasResult && <div className="pcd-result-arrow">{openingId === m.id ? '…' : '→'}</div>}
                </div>
              );
            })}
          </div>

          <button
            className="pcd-btn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={selectedIds.length < 2 || comparing}
            onClick={loadComparison}
          >
            {comparing ? 'Loading…' : `Compare selected (${selectedIds.length})`}
          </button>
        </>
      )}

      {selectedMatches.length > 0 && (
        <div className="pcd-card" style={{ overflowX: 'auto' }}>
          <div className="pcd-card-title" style={{ marginBottom: 14 }}>Side-by-side ({selectedMatches[0].selfName}'s performance)</div>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Metric</th>
                {selectedMatches.map(m => <th key={m.id} className="self-col">{m.oppName} · {formatDate(m.date)}</th>)}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.values.map((v, i) => <td key={i} className="self-col">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalMatch && <MatchDetailModal match={modalMatch} selfName={modalMatch.selfName || 'You'} onClose={() => setModalMatch(null)} />}
    </div>
  );
}
