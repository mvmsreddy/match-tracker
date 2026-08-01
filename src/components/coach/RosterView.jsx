import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeRankProgress } from '../../lib/segments';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

// One roster row's real form/training/pace — fetched independently per row
// (small roster sizes, same "each component owns its slice" pattern the
// player-side tabs already use) rather than one giant fan-out at the top.
function RosterRow({ player }) {
  const seg = player.segments[0]; // most-recently-updated segment
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
      paceLabel = paceOn ? 'On pace' : 'Behind';
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-sm bg-secondary flex items-center justify-center text-xs font-bold shrink-0">{initials(player.displayName)}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{player.displayName}</div>
            <div className="text-[12px] text-muted-foreground whitespace-nowrap">{seg ? `${seg.category} ${seg.subcategory}` : 'No segment'}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-bold">{seg ? seg.latest.rank : '—'}</TableCell>
      <TableCell className="text-right text-muted-foreground">{goal?.targetRank ?? '—'}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          {recent === null ? <span className="text-xs text-muted-foreground">…</span> :
            recent.length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
            recent.map((won, i) => (
              <span key={i} className={`w-5 h-5 rounded-sm flex items-center justify-center text-[12px] font-bold ${won ? 'bg-primary/15 text-accent-ink' : 'bg-destructive/15 text-destructive'}`}>{won ? 'W' : 'L'}</span>
            ))}
        </div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{hours30d == null ? '—' : `${hours30d}h`}</TableCell>
      <TableCell className={`text-right text-xs font-bold ${paceOn == null ? 'text-muted-foreground' : (paceOn ? 'text-accent-ink' : 'text-destructive')}`}>{paceLabel}</TableCell>
      <TableCell className="text-right">
        <Link to={`/coach/players/${player.id}/dashboard`} className="text-xs font-semibold text-accent-ink hover:underline whitespace-nowrap">Dashboard &rarr;</Link>
      </TableCell>
    </TableRow>
  );
}

// Roster + the real link-management flow (search/send/accept/decline/unlink).
// Each row links to the real Player Coaching Dashboard.
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setShowSearch(v => !v)}>{showSearch ? 'Close' : '+ Find a player'}</Button>
        {pending.length > 0 && <Badge variant="secondary">{pending.length} pending</Badge>}
      </div>

      {actionError && <div className="text-destructive text-xs">{actionError}</div>}

      {showSearch && (
        <Card className="p-4 sm:p-6">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or AITA reg…"
              className="flex-1 min-w-52"
            />
            <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>{searching ? 'Searching…' : 'Search'}</Button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-2 mt-4">
              {searchResults.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/50">
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-semibold">{p.displayName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {[p.aitaReg, p.stateAbbr, p.ranking && `Rank ${p.ranking}`, p.clubName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleSendRequest(p.id)}>Send request</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm mb-3">Sent requests</div>
          <div className="space-y-2">
            {pending.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/50">
                <div className="flex-1 text-sm font-semibold">{l.player?.displayName || '—'}</div>
                <Badge variant="secondary">Awaiting response</Badge>
                <Button size="sm" variant="outline" onClick={() => handleUnlink(l.id)}>Cancel</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Rank</TableHead>
              <TableHead className="text-right">Goal</TableHead>
              <TableHead>Recent form</TableHead>
              <TableHead className="text-right">Training</TableHead>
              <TableHead className="text-right">Pace</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No players linked yet — use "Find a player" above.</TableCell></TableRow>
            ) : (
              roster.map(p => <RosterRow key={p.id} player={p} />)
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="text-xs text-muted-foreground max-w-prose">
        Opening a player's dashboard gives you their full Overview, Tournaments, Training, Analytics, Recommendations
        and Progress — the same view they see, read-only.
      </div>
    </div>
  );
}
