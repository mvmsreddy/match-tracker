import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from '../lib/analytics';
import { Button } from '@/components/primitives/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

function fmtRatio(r) { return r === Infinity ? '∞' : r.toFixed(2); }
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
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Select two or more saved matches to compare</div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Compare Matches</h1>
      </div>

      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}
      {list === null && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading match history...</div>
      )}
      {list && list.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No saved matches yet. Generate a PDF report from the Tracker page to save one.
        </div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="space-y-2">
            {list.map((m) => (
              <label
                key={m.id}
                className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{m.selfName} vs {m.oppName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(m.tournament ? m.tournament + ' | ' : '')}{m.date || ''} {m.sessionType === 'practice' ? '(Practice)' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-sm font-bold">{m.scoreSummary}</div>
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4"
                    checked={selectedIds.includes(m.id)}
                    onChange={() => toggleSelect(m.id)}
                  />
                </div>
              </label>
            ))}
          </div>

          <Button
            type="button"
            disabled={selectedIds.length < 2 || loadingDetails}
            onClick={loadComparison}
          >
            {loadingDetails ? 'Loading...' : 'Compare selected (' + selectedIds.length + ')'}
          </Button>
        </>
      )}

      {selectedMatches.length > 0 && (
        <div className="rounded-sm border border-border bg-card p-4 sm:p-6 overflow-x-auto">
          <h2 className="font-display font-extrabold text-lg tracking-tighter mb-3">
            Side-by-side ({selectedMatches[0].selfName}'s performance)
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                {selectedMatches.map((m) => (
                  <TableHead key={m.id}>{m.oppName} &middot; {m.date || '-'}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-semibold">{row.label}</TableCell>
                  {row.values.map((v, i) => <TableCell key={i}>{v}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
