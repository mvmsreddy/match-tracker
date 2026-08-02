import { useMemo, useState } from 'react';
import * as api from '../../api';
import { usePlayerMatches } from '../../hooks/usePlayerMatches';
import MatchDetailModal from './MatchDetailModal';
import H2HInsight from './H2HInsight';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Merges the old standalone /history (flat match+practice list) and /compare
// (multi-match side-by-side diff) pages into one dashboard tab — neither is
// segment-scoped by design (a player's tracked matches span every category
// they've played), unlike every other tab here. Uses `playerId` throughout
// (not the logged-in user directly) so this also works correctly when a
// coach is viewing a linked player's dashboard.
export default function MyMatchesTab({ playerId, isOwnDashboard = true }) {
  const {
    matches, error, setError,
    selectedIds, toggleSelect,
    deleteMatch,
    comparing, loadComparison,
    selectedMatches, comparisonRows,
  } = usePlayerMatches(playerId);
  const [modalMatch, setModalMatch] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [filter, setFilter] = useState('all'); // all | matches | practice

  const matchCount = matches ? matches.filter(m => m.sessionType !== 'practice').length : 0;
  const practiceCount = matches ? matches.filter(m => m.sessionType === 'practice').length : 0;
  const filteredMatches = useMemo(() => (matches || []).filter(m => {
    if (filter === 'matches') return m.sessionType !== 'practice';
    if (filter === 'practice') return m.sessionType === 'practice';
    return true;
  }), [matches, filter]);

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
          <H2HInsight matches={matches} />

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[
              { id: 'all', label: `All (${matches.length})` },
              { id: 'matches', label: `Matches (${matchCount})` },
              { id: 'practice', label: `Practice (${practiceCount})` },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  filter === f.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredMatches.length === 0 && (
            <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
              No {filter === 'matches' ? 'matches' : 'practice sessions'} found. Try a different filter.
            </div>
          )}

          <div className="space-y-2.5">
            {filteredMatches.map(m => {
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
                      onClick={e => { e.stopPropagation(); deleteMatch(m.id); }}
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

      {modalMatch && (
        <MatchDetailModal
          match={modalMatch}
          selfName={modalMatch.selfName || 'You'}
          onClose={() => setModalMatch(null)}
          canViewFullReport={isOwnDashboard}
        />
      )}
    </div>
  );
}
