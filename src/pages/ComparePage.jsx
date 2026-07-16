import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from '../lib/analytics';
import TopNav from '../components/TopNav';

function fmtRatio(r) { return r === Infinity ? '\u221e' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

export default function ComparePage() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [details, setDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listMatches(user.id)
      .then((l) => { if (!cancelled) setList(l); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load match history'); });
    return () => { cancelled = true; };
  }, [user.id]);

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function loadComparison() {
    setLoadingDetails(true);
    setError('');
    try {
      const results = await Promise.all(selectedIds.map((id) => api.getMatch(user.id, id)));
      const byId = {};
      results.forEach((m) => { byId[m.id] = m; });
      setDetails(byId);
    } catch (e) {
      setError(e.message || 'Could not load selected matches');
    } finally {
      setLoadingDetails(false);
    }
  }

  const selectedMatches = selectedIds.map((id) => details[id]).filter(Boolean);
  const rows = selectedMatches.length > 0 ? buildComparisonRows(selectedMatches) : [];

  return (
    <div className="root">
      <TopNav />
      <div className="header">
        <h1 className="title">Compare Matches</h1>
        <div className="subtitle">SELECT TWO OR MORE SAVED MATCHES TO COMPARE &middot; {user.name}</div>
      </div>

      {error && <div className="history-empty">{error}</div>}
      {list === null && !error && <div className="history-empty">Loading match history...</div>}
      {list && list.length === 0 && (
        <div className="history-empty">No saved matches yet. Generate a PDF report from the Tracker page to save one.</div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="history-list">
            {list.map((m) => (
              <label className="history-card" key={m.id} style={{ cursor: 'pointer' }}>
                <div className="history-card-main">
                  <div className="history-card-title">{m.selfName} vs {m.oppName}</div>
                  <div className="history-card-sub">
                    {(m.tournament ? m.tournament + ' | ' : '')}{m.date || ''} {m.sessionType === 'practice' ? '(Practice)' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="history-card-score">{m.scoreSummary}</div>
                  <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelect(m.id)} />
                </div>
              </label>
            ))}
          </div>

          <div className="wrap" style={{ margin: '14px 0' }}>
            <button
              className="action-btn primary"
              disabled={selectedIds.length < 2 || loadingDetails}
              onClick={loadComparison}
            >
              {loadingDetails ? 'Loading...' : 'Compare selected (' + selectedIds.length + ')'}
            </button>
          </div>
        </>
      )}

      {selectedMatches.length > 0 && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <h2 className="panel-title">Side-by-side ({selectedMatches[0].selfName}'s performance)</h2>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Metric</th>
                {selectedMatches.map((m) => (
                  <th key={m.id} className="self-col">{m.oppName} &middot; {m.date || '-'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.values.map((v, i) => <td key={i} className="self-col">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function buildComparisonRows(matches) {
  const perMatch = matches.map((m) => {
    const cfgOpts = { sessionType: m.sessionType, formatPreset: m.formatPreset, pointTarget: m.pointTarget };
    const stats = computeStats(m.points);
    const serve = computeServeStats(m.points, 'self');
    const ret = computeReturnStats(m.points, 'self');
    const analytics = replayMatchAnalytics(m.points, cfgOpts);
    return { m, stats, serve, ret, analytics };
  });

  return [
    { label: 'Score', values: perMatch.map((x) => x.m.scoreSummary || '-') },
    { label: 'Winner', values: perMatch.map((x) => (x.m.winner === 'self' ? x.m.selfName : (x.m.winner === 'opp' ? x.m.oppName : 'In progress'))) },
    { label: 'Winners/Forced Errors', values: perMatch.map((x) => x.stats.self.wfe) },
    { label: 'Unforced Errors', values: perMatch.map((x) => x.stats.self.ue) },
    { label: 'W/FE : UE Ratio', values: perMatch.map((x) => fmtRatio(x.stats.self.ratio)) },
    { label: 'Points Won', values: perMatch.map((x) => x.stats.self.pointCount) },
    { label: 'Aces', values: perMatch.map((x) => x.serve.aces) },
    { label: 'Double Faults', values: perMatch.map((x) => x.serve.dfs) },
    { label: '1st Serve %', values: perMatch.map((x) => fmtPct(x.serve.firstPct)) },
    { label: 'Break Points Saved', values: perMatch.map((x) => x.analytics.bp.self.savedServing + '/' + x.analytics.bp.self.facedServing) },
    { label: 'Break Points Won', values: perMatch.map((x) => x.analytics.bp.self.wonReturning + '/' + x.analytics.bp.self.facedReturning) },
    { label: 'Return Winners/Forced', values: perMatch.map((x) => x.ret.retWinnersForced) },
  ];
}
