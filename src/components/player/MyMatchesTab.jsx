import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from '../../lib/analytics';
import MatchDetailModal from './MatchDetailModal';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

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
// coach is viewing a linked player's dashboard.
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

  if (matches === null) return <div className="text-sm text-muted-foreground">Loading match history…</div>;

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">{matches.length} saved match{matches.length === 1 ? '' : 'es'} &amp; practice sessions</div>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}

      {matches.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <div className="text-3xl mb-3">🎾</div>
          <div className="text-sm text-muted-foreground">
            No matches saved yet. Generate a PDF report from the Tracker page to save a match here.
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <>
          <div className="space-y-2.5">
            {matches.map(m => {
              const hasResult = m.winner === 'self' || m.winner === 'opp';
              const isWin = m.winner === 'self';
              const isLoss = m.winner === 'opp';
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border bg-card transition-all ${
                    hasResult ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''
                  } ${
                    isWin ? 'border-l-4 border-l-primary' : isLoss ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-muted'
                  }`}
                  onClick={() => hasResult && openMatch(m)}
                >
                  <input
                    type="checkbox"
                    className="accent-primary w-5 h-5 shrink-0"
                    checked={selectedIds.includes(m.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelect(m.id)}
                  />
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    isWin ? 'bg-primary/10 text-accent-ink' : 
                    isLoss ? 'bg-destructive/10 text-destructive' : 
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isWin ? 'W' : isLoss ? 'L' : (m.sessionType === 'practice' ? 'PR' : '–')}
                  </div>
                  <div className="flex-1 min-w-32">
                    <div className="text-sm font-bold truncate">{m.selfName} vs {m.oppName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {m.tournament ? `${m.tournament} · ` : ''}{formatDate(m.date)}{m.sessionType === 'practice' ? ' · Practice' : ''}
                    </div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ${isWin ? 'text-accent-ink' : isLoss ? 'text-destructive' : ''}`}>{m.scoreSummary || '—'}</div>
                  {isOwnDashboard && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9 shrink-0"
                      onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                      title="Delete"
                    >
                      ✕
                    </Button>
                  )}
                  {hasResult && <div className="text-muted-foreground shrink-0">{openingId === m.id ? '…' : '→'}</div>}
                </div>
              );
            })}
          </div>

          <Button size="sm" disabled={selectedIds.length < 2 || comparing} onClick={loadComparison}>
            {comparing ? 'Loading…' : `Compare selected (${selectedIds.length})`}
          </Button>
        </>
      )}

      {selectedMatches.length > 0 && (
        <Card className="p-4 sm:p-6 overflow-x-auto">
          <div className="font-bold text-sm mb-3">Side-by-side ({selectedMatches[0].selfName}'s performance)</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                {selectedMatches.map(m => <TableHead key={m.id}>{m.oppName} &middot; {formatDate(m.date)}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonRows.map(row => (
                <TableRow key={row.label}>
                  <TableCell className="font-semibold">{row.label}</TableCell>
                  {row.values.map((v, i) => <TableCell key={i}>{v}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {modalMatch && <MatchDetailModal match={modalMatch} selfName={modalMatch.selfName || 'You'} onClose={() => setModalMatch(null)} />}
    </div>
  );
}
