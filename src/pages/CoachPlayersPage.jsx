import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Badge } from '@/components/primitives/badge';

export default function CoachPlayersPage() {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';

  const [links, setLinks]           = useState(null);
  const [roster, setRoster]         = useState(null); // coach-only: segment-aware roster
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [error, setError]           = useState('');
  const [actionError, setActionError] = useState('');

  // Load all links (as coach or as player)
  useEffect(() => {
    let cancelled = false;
    api.getCoachLinks(user.id)
      .then(data => { if (!cancelled) setLinks(data); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user.id]);

  // Segment-aware roster — coach-only, drives the segment chips below
  useEffect(() => {
    if (!isCoach) return;
    let cancelled = false;
    api.getRosterWithSegments(user.id)
      .then(data => { if (!cancelled) setRoster(data); })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isCoach]);

  const myLinks = links || [];
  const activeLinks  = myLinks.filter(l => l.status === 'active');
  const pendingLinks = myLinks.filter(l => l.status === 'pending');

  // Pending incoming (player sees requests from coaches)
  const incomingPending = pendingLinks.filter(l => l.playerId === user.id);
  // Pending outgoing (coach sees requests they sent)
  const outgoingPending = pendingLinks.filter(l => l.coachId === user.id);

  // Search players (coaches only)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setActionError('');
    try {
      const results = await api.searchPlayers(searchQuery);
      const linkedIds = myLinks.map(l => l.playerId);
      setSearchResults(results.filter(p => !linkedIds.includes(p.id) && p.id !== user.id));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, myLinks, user.id]);

  async function handleSendRequest(playerId) {
    setActionError('');
    try {
      const link = await api.sendCoachRequest(user.id, playerId);
      setLinks(prev => [...(prev || []), link]);
      setSearchResults(prev => prev.filter(p => p.id !== playerId));
    } catch (err) {
      setActionError(err.message || 'Could not send request');
    }
  }

  async function handleRespond(linkId, status) {
    setActionError('');
    try {
      const updated = await api.respondToCoachRequest(linkId, status);
      setLinks(prev => prev.map(l => l.id === linkId ? updated : l));
    } catch (err) {
      setActionError(err.message || 'Could not update request');
    }
  }

  async function handleUnlink(linkId) {
    if (!window.confirm('Remove this link?')) return;
    setActionError('');
    try {
      await api.deleteCoachLink(linkId);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (err) {
      setActionError(err.message || 'Could not remove link');
    }
  }

  function getOtherParty(link) {
    return isCoach ? link.player : link.coach;
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tighter">{isCoach ? 'My Players' : 'My Coaches'}</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {isCoach ? 'Players linked to your coaching profile' : 'Coaches connected to your player profile'}
          </div>
        </div>
        {isCoach && (
          <Link to="/my-players"><Button variant="outline" size="sm">Coach Intelligence &rarr;</Button></Link>
        )}
      </div>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {actionError && <div className="text-destructive text-sm">{actionError}</div>}

      {isCoach && (
        <Card className="p-4 sm:p-6">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Find a Player</div>
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
                  <Button size="sm" onClick={() => handleSendRequest(p.id)}>Send Request</Button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <div className="text-sm text-muted-foreground mt-4">No players found. Try a different name or AITA reg.</div>
          )}
        </Card>
      )}

      {incomingPending.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Pending Requests</div>
          <div className="space-y-2">
            {incomingPending.map(link => {
              const other = getOtherParty(link);
              return (
                <div key={link.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/50 flex-wrap">
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-semibold">{other?.displayName || '—'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[other?.clubName, other?.stateAbbr].filter(Boolean).join(' · ')}
                    </div>
                    <Badge variant="secondary" className="mt-1.5">Request pending</Badge>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => handleRespond(link.id, 'active')}>Accept</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleRespond(link.id, 'declined')}>Decline</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {outgoingPending.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Sent Requests</div>
          <div className="space-y-2">
            {outgoingPending.map(link => {
              const other = getOtherParty(link);
              return (
                <div key={link.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/50">
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-semibold">{other?.displayName || '—'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{[other?.aitaReg, other?.stateAbbr].filter(Boolean).join(' · ')}</div>
                    <Badge variant="secondary" className="mt-1.5">Awaiting response</Badge>
                  </div>
                  <button className="w-8 h-8 rounded-sm hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleUnlink(link.id)} title="Cancel request">✕</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {links === null && <div className="text-sm text-muted-foreground">Loading…</div>}

      {links !== null && activeLinks.length === 0 && pendingLinks.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {isCoach
            ? 'No players linked yet. Search above to find and connect with players.'
            : 'No coaches linked yet. Ask your coach to send you a connection request.'}
        </div>
      )}

      {activeLinks.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">
            {isCoach ? `Active Players (${activeLinks.length})` : `My Coaches (${activeLinks.length})`}
          </div>
          <div className="space-y-2">
            {activeLinks.map(link => {
              const other = getOtherParty(link);
              const rosterEntry = isCoach ? roster?.find(r => r.id === other?.id) : null;
              return (
                <div key={link.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-card">
                  <div className="flex-1 min-w-40">
                    <div className="text-sm font-semibold">
                      {isCoach
                        ? <Link to={`/coach/players/${other?.id}`} className="hover:text-accent-ink">{other?.displayName || '—'}</Link>
                        : (other?.displayName || '—')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[other?.aitaReg && `AITA ${other.aitaReg}`, other?.stateAbbr, other?.ranking && `Rank ${other.ranking}`, other?.clubName].filter(Boolean).join(' · ')}
                    </div>
                    {rosterEntry && rosterEntry.segments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rosterEntry.segments.map(s => (
                          <Badge key={s.key} variant="secondary">{s.category} {s.subcategory} &middot; #{s.latest.rank}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="w-8 h-8 rounded-sm hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleUnlink(link.id)} title="Remove link">✕</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
