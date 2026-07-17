import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

export default function CoachPlayersPage() {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';

  const [links, setLinks]           = useState(null);
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
      // Filter out already linked players
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
    <div className="root">
      <TopNav />

      <div className="header">
        <h1 className="title">{isCoach ? 'My Players' : 'My Coaches'}</h1>
        <div className="subtitle">
          {isCoach
            ? 'Players linked to your coaching profile'
            : 'Coaches connected to your player profile'}
        </div>
      </div>

      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}
        {actionError && (
          <div className="login-error" style={{ maxWidth: 680, margin: '8px auto', padding: '0 16px' }}>
            {actionError}
          </div>
        )}

        {/* Coach: search for players to link */}
        {isCoach && (
          <div className="cp-search-section">
            <div className="cp-section-label">Find a Player</div>
            <div className="cp-search-row">
              <input
                className="cp-search-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name or AITA reg…"
              />
              <button
                className="action-btn primary"
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="cp-results">
                {searchResults.map(p => (
                  <div key={p.id} className="cp-result-card">
                    <div className="cp-result-info">
                      <div className="cp-result-name">{p.displayName}</div>
                      <div className="cp-result-meta">
                        {p.aitaReg && <span>{p.aitaReg}</span>}
                        {p.stateAbbr && <span> · {p.stateAbbr}</span>}
                        {p.ranking && <span> · Rank {p.ranking}</span>}
                        {p.clubName && <span> · {p.clubName}</span>}
                      </div>
                    </div>
                    <button
                      className="action-btn primary"
                      onClick={() => handleSendRequest(p.id)}
                    >
                      Send Request
                    </button>
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQuery && !searching && (
              <div className="cp-no-results">No players found. Try a different name or AITA reg.</div>
            )}
          </div>
        )}

        {/* Incoming pending requests (player side) */}
        {incomingPending.length > 0 && (
          <div className="cp-section">
            <div className="cp-section-label">Pending Requests</div>
            {incomingPending.map(link => {
              const other = getOtherParty(link);
              return (
                <div key={link.id} className="cp-link-card cp-link-pending">
                  <div className="cp-link-info">
                    <div className="cp-link-name">{other?.displayName || '—'}</div>
                    <div className="cp-link-meta">
                      {other?.clubName && <span>{other.clubName}</span>}
                      {other?.stateAbbr && <span> · {other.stateAbbr}</span>}
                    </div>
                    <div className="cp-link-status-tag pending">Request pending</div>
                  </div>
                  <div className="cp-link-actions">
                    <button
                      className="action-btn primary"
                      onClick={() => handleRespond(link.id, 'active')}
                    >
                      Accept
                    </button>
                    <button
                      className="action-btn danger"
                      onClick={() => handleRespond(link.id, 'declined')}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Outgoing pending (coach side) */}
        {outgoingPending.length > 0 && (
          <div className="cp-section">
            <div className="cp-section-label">Sent Requests</div>
            {outgoingPending.map(link => {
              const other = getOtherParty(link);
              return (
                <div key={link.id} className="cp-link-card cp-link-pending">
                  <div className="cp-link-info">
                    <div className="cp-link-name">{other?.displayName || '—'}</div>
                    <div className="cp-link-meta">
                      {other?.aitaReg && <span>{other.aitaReg}</span>}
                      {other?.stateAbbr && <span> · {other.stateAbbr}</span>}
                    </div>
                    <div className="cp-link-status-tag pending">Awaiting response</div>
                  </div>
                  <button className="t-delete-btn" onClick={() => handleUnlink(link.id)} title="Cancel request">✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Active links */}
        {links === null && <div className="history-empty">Loading…</div>}

        {links !== null && activeLinks.length === 0 && pendingLinks.length === 0 && (
          <div className="history-empty">
            {isCoach
              ? 'No players linked yet. Search above to find and connect with players.'
              : 'No coaches linked yet. Ask your coach to send you a connection request.'}
          </div>
        )}

        {activeLinks.length > 0 && (
          <div className="cp-section">
            <div className="cp-section-label">
              {isCoach ? `Active Players (${activeLinks.length})` : `My Coaches (${activeLinks.length})`}
            </div>
            {activeLinks.map(link => {
              const other = getOtherParty(link);
              return (
                <div key={link.id} className="cp-link-card">
                  <div className="cp-link-info">
                    <div className="cp-link-name">{other?.displayName || '—'}</div>
                    <div className="cp-link-meta">
                      {other?.aitaReg && <span>AITA {other.aitaReg}</span>}
                      {other?.stateAbbr && <span> · {other.stateAbbr}</span>}
                      {other?.ranking && <span> · Rank {other.ranking}</span>}
                      {other?.clubName && <span> · {other.clubName}</span>}
                    </div>
                  </div>
                  <button
                    className="t-delete-btn"
                    onClick={() => handleUnlink(link.id)}
                    title="Remove link"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
