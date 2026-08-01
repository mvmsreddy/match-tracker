import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from '../lib/analytics';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { Input } from '@/components/primitives/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

function fmtRatio(r) { return r === Infinity ? '∞' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

export default function ComparePage() {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const [mode, setMode] = useState('matches'); // 'matches' | 'players'
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
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
          {mode === 'matches' ? 'Select two or more saved matches to compare' : 'Compare two players on your roster'}
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Compare</h1>
      </div>

      {isCoach && (
        <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1">
          <button
            type="button"
            className={`px-4 py-1.5 rounded-sm text-xs font-semibold transition-colors ${mode === 'matches' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMode('matches')}
          >
            My Matches
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 rounded-sm text-xs font-semibold transition-colors ${mode === 'players' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMode('players')}
          >
            Players
          </button>
        </div>
      )}

      {mode === 'players' && isCoach && <PlayerCompareView coachId={user.id} />}

      {mode === 'matches' && (
        <>
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
          <H2HInsight matches={list} />

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
        </>
      )}
    </div>
  );
}

const COMPARE_RANGES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'all', label: 'All' },
];

// Coach-only "Players" mode — pick two roster players, see aggregate stats
// side by side over a range, with a "Gap insight" callout and Saved Compare
// Views (bookmark a pair+range for one-click reload). Player-to-player
// comparison itself has no dedicated link — it reuses the coach's existing
// RLS read access to each linked player's matches (api.getPlayerComparison).
function PlayerCompareView({ coachId }) {
  const [players, setPlayers] = useState(null);
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [range, setRange] = useState('month');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getLinkedPlayersForCompare(coachId)
      .then(data => { if (!cancelled) setPlayers(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load roster'); setPlayers([]); } });
    api.getSavedCompares(coachId)
      .then(data => { if (!cancelled) setSaved(data); })
      .catch(() => { if (!cancelled) setSaved([]); });
    return () => { cancelled = true; };
  }, [coachId]);

  async function handleCompare() {
    if (!playerAId || !playerBId || playerAId === playerBId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getPlayerComparison(playerAId, playerBId, range);
      setResult(data);
    } catch (e) {
      setError(e.message || 'Could not compute comparison');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!saveName.trim() || !playerAId || !playerBId) return;
    try {
      const created = await api.createSavedCompare(coachId, { name: saveName.trim(), playerAId, playerBId, range });
      setSaved(prev => [created, ...(prev || [])]);
      setSaveName('');
    } catch (e) {
      setError(e.message || 'Could not save this view');
    }
  }

  async function handleLoadSaved(s) {
    setPlayerAId(s.playerAId);
    setPlayerBId(s.playerBId);
    setRange(s.range);
    setLoading(true);
    try {
      const data = await api.getPlayerComparison(s.playerAId, s.playerBId, s.range);
      setResult(data);
    } catch (e) {
      setError(e.message || 'Could not compute comparison');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSaved(id) {
    try {
      await api.deleteSavedCompare(id);
      setSaved(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError(e.message || 'Could not remove saved view');
    }
  }

  const playerName = (id) => players?.find(p => p.id === id)?.displayName || '—';

  if (players === null) return <div className="text-sm text-muted-foreground">Loading roster…</div>;
  if (players.length < 2) {
    return (
      <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
        Link at least 2 players to compare them head-to-head.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-destructive text-sm">{error}</div>}

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Player A</div>
            <select className="rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9" value={playerAId} onChange={e => setPlayerAId(e.target.value)}>
              <option value="">Select…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Player B</div>
            <select className="rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9" value={playerBId} onChange={e => setPlayerBId(e.target.value)}>
              <option value="">Select…</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </div>
          <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1">
            {COMPARE_RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${range === r.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button size="sm" disabled={!playerAId || !playerBId || playerAId === playerBId || loading} onClick={handleCompare}>
            {loading ? 'Comparing…' : 'Compare'}
          </Button>
        </div>
      </Card>

      {saved && saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map(s => (
            <div key={s.id} className="inline-flex items-center gap-2 text-xs font-semibold rounded-sm px-2 py-1 bg-secondary">
              <button className="hover:underline" onClick={() => handleLoadSaved(s)}>{s.name}</button>
              <button onClick={() => handleDeleteSaved(s.id)} className="text-muted-foreground hover:text-destructive" title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      {result && (
        <>
          <Card className="p-4 sm:p-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>{playerName(playerAId)}</TableHead>
                  <TableHead>{playerName(playerBId)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-semibold">Matches</TableCell><TableCell>{result.a.matchCount}</TableCell><TableCell>{result.b.matchCount}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Wins</TableCell><TableCell>{result.a.wins}</TableCell><TableCell>{result.b.wins}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Losses</TableCell><TableCell>{result.a.losses}</TableCell><TableCell>{result.b.losses}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Winners/Forced Errors</TableCell><TableCell>{result.a.wfe}</TableCell><TableCell>{result.b.wfe}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Unforced Errors</TableCell><TableCell>{result.a.ue}</TableCell><TableCell>{result.b.ue}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Aces</TableCell><TableCell>{result.a.aces}</TableCell><TableCell>{result.b.aces}</TableCell></TableRow>
                <TableRow><TableCell className="font-semibold">Drill Minutes</TableCell><TableCell>{result.a.drillMinutes}</TableCell><TableCell>{result.b.drillMinutes}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Gap Insight</div>
            <div className="text-sm">{buildGapInsight(playerName(playerAId), playerName(playerBId), result)}</div>
          </Card>

          <Card className="p-4 sm:p-6">
            <div className="flex gap-2 flex-wrap">
              <Input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this view (e.g. 'U16 rivalry')" className="flex-1 min-w-48" />
              <Button size="sm" variant="outline" onClick={handleSave} disabled={!saveName.trim()}>Save this view</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function buildGapInsight(nameA, nameB, result) {
  const { a, b } = result;
  const winRateA = a.matchCount > 0 ? (a.wins / a.matchCount) * 100 : null;
  const winRateB = b.matchCount > 0 ? (b.wins / b.matchCount) * 100 : null;
  if (winRateA == null || winRateB == null) return 'Not enough tracked matches yet for either player in this range.';
  const leader = winRateA >= winRateB ? nameA : nameB;
  const gap = Math.abs(winRateA - winRateB).toFixed(0);
  const aceLeader = a.aces >= b.aces ? nameA : nameB;
  return `${leader} leads on win rate by ${gap} points in this range. ${aceLeader} has hit more aces (${Math.max(a.aces, b.aces)} vs ${Math.min(a.aces, b.aces)}).`;
}

// Head-to-Head insight — groups matches by opponent, computes W-L per opponent
function H2HInsight({ matches }) {
  const matchOnly = (matches || []).filter(m => m.sessionType !== 'practice' && m.oppName);
  const byOpp = matchOnly.reduce((acc, m) => {
    const key = m.oppName.trim().toLowerCase();
    if (!acc[key]) acc[key] = { name: m.oppName, matches: [], wins: 0, losses: 0 };
    acc[key].matches.push(m);
    if (m.winner === 'self') acc[key].wins++;
    else if (m.winner === 'opp') acc[key].losses++;
    return acc;
  }, {});
  const rivals = Object.values(byOpp)
    .filter(r => r.matches.length >= 2)
    .sort((a, b) => (b.matches.length - a.matches.length) || (b.wins - a.wins));

  if (rivals.length === 0) return null;

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="h2h-insight">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Head-to-Head</div>
          <div className="text-sm font-bold mt-0.5">Your rivalries · {rivals.length} opponent{rivals.length === 1 ? '' : 's'} played 2+ times</div>
        </div>
      </div>
      <div className="space-y-2">
        {rivals.slice(0, 5).map(r => {
          const total = r.wins + r.losses;
          const winPct = total > 0 ? Math.round((r.wins / total) * 100) : 0;
          const dominant = r.wins > r.losses;
          const even = r.wins === r.losses;
          return (
            <div
              key={r.name}
              className="p-3 rounded-lg border border-border bg-card"
              data-testid={`h2h-rival-${r.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.matches.length} match{r.matches.length === 1 ? '' : 'es'} played</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">
                    <span className="text-accent-ink">{r.wins}</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span className="text-destructive">{r.losses}</span>
                  </div>
                  <div className={`text-[12px] font-bold uppercase tracking-wider ${dominant ? 'text-accent-ink' : even ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {dominant ? 'Leading' : even ? 'Even' : 'Trailing'}
                  </div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                {r.wins > 0 && (
                  <div className="bg-primary transition-all" style={{ width: `${(r.wins / total) * 100}%` }} />
                )}
                {r.losses > 0 && (
                  <div className="bg-destructive transition-all" style={{ width: `${(r.losses / total) * 100}%` }} />
                )}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5">
                Last: {r.matches[0].scoreSummary || '—'} ({r.matches[0].winner === 'self' ? 'W' : r.matches[0].winner === 'opp' ? 'L' : '—'}) · {r.matches[0].date || 'unknown date'}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
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
