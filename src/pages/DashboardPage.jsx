import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { useTournamentActivity } from '../hooks/useTournamentActivity';
import TopNav from '../components/TopNav';

// ---------------------------------------------------------------------------
// Role-specific banners shown at the top of the dashboard
// ---------------------------------------------------------------------------

function OrganizerBanner({ user }) {
  return (
    <div className="db-role-banner db-role-banner-organizer">
      <div className="db-role-banner-text">
        <div className="db-role-banner-title">Tournament Organizer</div>
        <div className="db-role-banner-sub">
          {user.clubName || 'Create and manage AITA tournament events'}
          {user.isVerified && <span className="db-verified-badge">Verified</span>}
        </div>
      </div>
      <Link to="/tournaments" className="db-role-cta">
        My Events →
      </Link>
    </div>
  );
}

function CoachBanner({ user, links }) {
  const activeCount = (links || []).filter(l => l.status === 'active').length;
  const pendingCount = (links || []).filter(l => l.status === 'pending' && l.coachId === user.id).length;
  return (
    <div className="db-role-banner db-role-banner-coach">
      <div className="db-role-banner-text">
        <div className="db-role-banner-title">Coach</div>
        <div className="db-role-banner-sub">
          {activeCount} player{activeCount !== 1 ? 's' : ''} linked
          {pendingCount > 0 && ` · ${pendingCount} pending`}
          {user.clubName && ` · ${user.clubName}`}
        </div>
      </div>
      <Link to="/my-players" className="db-role-cta">
        My Players →
      </Link>
    </div>
  );
}

function PlayerBanner({ user, links }) {
  const coachCount = (links || []).filter(l => l.status === 'active').length;
  const pendingCount = (links || []).filter(l => l.status === 'pending' && l.playerId === user.id).length;
  return (
    <div className="db-role-banner db-role-banner-player">
      <div className="db-role-banner-text">
        <div className="db-role-banner-title">Player</div>
        <div className="db-role-banner-sub">
          {user.aitaReg && `AITA ${user.aitaReg} · `}
          {user.ranking && `Rank ${user.ranking} · `}
          {user.stateAbbr || ''}
          {coachCount > 0 && ` · ${coachCount} coach${coachCount !== 1 ? 'es' : ''}`}
          {pendingCount > 0 && (
            <span className="db-pending-alert"> · {pendingCount} coach request{pendingCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      {pendingCount > 0 && (
        <Link to="/my-coaches" className="db-role-cta db-role-cta-alert">
          View Requests →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tournament activity helpers (Phase 11)
// ---------------------------------------------------------------------------

function opponentName(match) {
  const opp = match.mineSide === 'entry1' ? match.entry2 : match.entry1;
  if (!opp) return 'TBD';
  if (opp.isBye) return 'BYE';
  return opp.familyName + (opp.firstName ? `, ${opp.firstName}` : '');
}

function TodayMatchRow({ match, showOwner, ownerName }) {
  return (
    <div className="dashboard-match-card" style={{ cursor: 'default' }}>
      <div className="dashboard-match-info">
        <div className="dashboard-match-title">
          {showOwner && ownerName ? `${ownerName} vs ` : 'vs '}{opponentName(match)}
        </div>
        <div className="dashboard-match-sub">
          {match.eventAgeGroup} {match.eventCategory} · R{match.round}
          {match.courtNumber != null && ` · Court ${match.courtNumber}`}
          {match.matchOrder != null && ` · #${match.matchOrder}`}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ match, showOwner, ownerName }) {
  const won = match.winnerEntryId && match.mineSide && match.winnerEntryId === match[match.mineSide + 'Id'];
  return (
    <div className="dashboard-match-card" style={{ cursor: 'default' }}>
      <div className="dashboard-match-info">
        <div className="dashboard-match-title">
          {showOwner && ownerName ? `${ownerName} vs ` : 'vs '}{opponentName(match)}
        </div>
        <div className="dashboard-match-sub">
          {match.eventAgeGroup} {match.eventCategory} · R{match.round} · {match.week?.name}
        </div>
      </div>
      <div className="dashboard-match-right">
        {won && <span className="result-badge result-win">W</span>}
        {!won && <span className="result-badge result-loss">L</span>}
        <span className="history-card-score">{match.score || match.outcomeType?.toUpperCase()}</span>
      </div>
    </div>
  );
}

function PlayerTournamentSections({ loading, error, tournaments, todayMatches, recentResults }) {
  if (loading) return <div className="history-empty">Loading tournament activity…</div>;
  if (error) return <div className="history-empty">{error}</div>;
  if (tournaments.length === 0) {
    return <div className="history-empty">Not entered in any tournaments yet.</div>;
  }

  return (
    <div className="dashboard-recent">
      <div className="dashboard-section-title">My Tournaments</div>
      {tournaments.map(({ week, events }) => (
        <div key={week.id} className="db-tourney-card">
          <Link to={`/tournaments/${week.id}`} className="db-tourney-name">{week.name}</Link>
          <div className="db-tourney-meta">
            {[week.location, week.city, week.startDate].filter(Boolean).join(' · ')}
          </div>
          {events.map(({ event, entry }) => (
            <Link
              key={entry.id}
              to={`/tournaments/${week.id}/events/${event.id}`}
              className="db-event-row"
            >
              <span>{event.ageGroup} {event.category}{entry.drawType === 'qualifying' ? ' (Qualifying)' : ''}</span>
              <span className="db-event-pos">
                {entry.seed ? `Seed ${entry.seed} · ` : ''}Pos {entry.position}
              </span>
            </Link>
          ))}
        </div>
      ))}

      <div className="dashboard-section-title" style={{ marginTop: 20 }}>Today's Matches</div>
      {todayMatches.length === 0 ? (
        <div className="history-empty">No matches scheduled for today.</div>
      ) : (
        <div className="dashboard-match-list">
          {todayMatches.map(m => <TodayMatchRow key={m.id} match={m} />)}
        </div>
      )}

      <div className="dashboard-section-title" style={{ marginTop: 20 }}>Recent Results</div>
      {recentResults.length === 0 ? (
        <div className="history-empty">No completed matches yet.</div>
      ) : (
        <div className="dashboard-match-list">
          {recentResults.slice(0, 5).map(m => <ResultRow key={m.id} match={m} />)}
        </div>
      )}
    </div>
  );
}

function CoachTournamentSections({ loading, error, todayMatches, recentResults, activeLinks }) {
  if (loading) return <div className="history-empty">Loading tournament activity…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  const nameFor = aitaReg => {
    const link = activeLinks.find(l => l.player?.aitaReg === aitaReg);
    return link?.player?.displayName || null;
  };

  const roster = activeLinks.map(l => {
    const mine = recentResults.filter(m => m.ownerAitaReg === l.player?.aitaReg);
    const wins = mine.filter(m => m.winnerEntryId && m.mineSide && m.winnerEntryId === m[m.mineSide + 'Id']).length;
    return { link: l, wins, losses: mine.length - wins };
  });

  return (
    <div className="dashboard-recent">
      <div className="dashboard-section-title">Today — All Players</div>
      {todayMatches.length === 0 ? (
        <div className="history-empty">No matches scheduled for today across your roster.</div>
      ) : (
        <div className="dashboard-match-list">
          {todayMatches.map(m => (
            <TodayMatchRow key={m.id} match={m} showOwner ownerName={nameFor(m.ownerAitaReg)} />
          ))}
        </div>
      )}

      <div className="dashboard-section-title" style={{ marginTop: 20 }}>Roster</div>
      {roster.length === 0 ? (
        <div className="history-empty">No players linked yet.</div>
      ) : (
        <div className="db-roster-list">
          {roster.map(({ link, wins, losses }) => (
            <div key={link.id} className="db-roster-row">
              <div>
                <div className="db-tourney-name" style={{ fontSize: '0.9rem' }}>{link.player?.displayName}</div>
                <div className="db-tourney-meta">
                  {link.player?.aitaReg && `AITA ${link.player.aitaReg}`}
                  {link.player?.ranking && ` · Rank ${link.player.ranking}`}
                </div>
              </div>
              <div className="db-roster-record">{wins}W – {losses}L</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';

  const [matches, setMatches]   = useState(null);
  const [links, setLinks]       = useState(null);
  const [error, setError]       = useState('');
  // Phase 20 — My Entries + pending invitations
  const [myEntries, setMyEntries]         = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Load personal match history for players and coaches
  useEffect(() => {
    if (role === 'organizer') return;
    let cancelled = false;
    api.listMatches(user.id)
      .then(list => { if (!cancelled) setMatches(list); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load matches'); });
    return () => { cancelled = true; };
  }, [user.id, role]);

  // Load coach/player links for coach + player banners
  useEffect(() => {
    if (role === 'organizer') return;
    let cancelled = false;
    api.getCoachLinks(user.id)
      .then(data => { if (!cancelled) setLinks(data); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [user.id, role]);

  // Phase 20 — load player's self-entered events + pending invitations
  useEffect(() => {
    if (role !== 'player') return;
    let cancelled = false;
    api.getMyEntries().then(data => { if (!cancelled) setMyEntries(data); }).catch(() => {});
    api.getMyPendingInvitations().then(data => { if (!cancelled) setPendingInvites(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [role]);

  const matchesOnly = matches ? matches.filter(m => m.sessionType !== 'practice') : [];
  const practices   = matches ? matches.filter(m => m.sessionType === 'practice') : [];
  const wins        = matchesOnly.filter(m => m.winner === 'self').length;
  const losses      = matchesOnly.filter(m => m.winner === 'opp').length;
  const winRate     = matchesOnly.length > 0 ? Math.round((wins / matchesOnly.length) * 100) : null;
  const recent      = matches ? matches.slice(0, 5) : [];

  // Phase 11 — tournament activity (player: self, coach: whole active roster)
  const activeLinks = (links || []).filter(l => l.status === 'active');
  const rosterAitaRegs = role === 'coach'
    ? activeLinks.map(l => l.player?.aitaReg).filter(Boolean)
    : role === 'player' && user.aitaReg ? [user.aitaReg] : [];
  const activity = useTournamentActivity(rosterAitaRegs);

  return (
    <div className="root">
      <TopNav />

      <div className="dashboard-body">
        {/* Role banner */}
        {role === 'organizer' && <OrganizerBanner user={user} />}
        {role === 'coach'     && <CoachBanner user={user} links={links} />}
        {role === 'player'    && <PlayerBanner user={user} links={links} />}

        {/* Welcome */}
        <div className="dashboard-welcome">
          <h1 className="dashboard-title">
            Welcome back, {(user.displayName || user.name || '').split(' ')[0]}
          </h1>
          <div className="dashboard-subtitle">
            {role === 'organizer' ? 'Tournament management overview'
              : role === 'coach' ? 'Your coaching overview'
              : 'Your performance overview'}
          </div>
        </div>

        {/* Organizer: quick actions only */}
        {role === 'organizer' && (
          <div className="db-organizer-actions">
            <Link to="/tournaments" className="dashboard-cta">
              View My Tournaments
            </Link>
            <div className="history-empty" style={{ marginTop: 20 }}>
              Use the <strong>Tournaments</strong> section to create events, manage draws, and enter scores.
            </div>
          </div>
        )}

        {/* Player: pending doubles invitations */}
        {role === 'player' && pendingInvites.length > 0 && (
          <div className="dashboard-recent">
            <div className="dashboard-section-title" style={{ color: '#f59e0b' }}>
              Doubles Invitations ({pendingInvites.length})
            </div>
            {pendingInvites.map(inv => (
              <div key={inv.id} className="dashboard-match-card" style={{ cursor: 'default' }}>
                <div className="dashboard-match-info">
                  <div className="dashboard-match-title">
                    Doubles invitation — {inv.event?.tournament_week?.name || 'tournament'}
                  </div>
                  <div className="dashboard-match-sub">
                    {inv.event?.category} {inv.event?.age_group} · From AITA {inv.inviter_aita_reg}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="action-btn primary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={async () => {
                      try {
                        await api.respondToInvitation(inv.id, true);
                        setPendingInvites(prev => prev.filter(i => i.id !== inv.id));
                      } catch (e) { alert(e.message); }
                    }}
                  >Accept</button>
                  <button
                    className="action-btn"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={async () => {
                      try {
                        await api.respondToInvitation(inv.id, false);
                        setPendingInvites(prev => prev.filter(i => i.id !== inv.id));
                      } catch (e) { alert(e.message); }
                    }}
                  >Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Player: My Entries */}
        {role === 'player' && myEntries !== null && myEntries.length > 0 && (
          <div className="dashboard-recent">
            <div className="dashboard-section-title">My Entries</div>
            {myEntries.filter(e => e.entryStatus !== 'withdrawn').map(entry => (
              <div key={entry.id} className="dashboard-match-card" style={{ cursor: 'default' }}>
                <div className="dashboard-match-info">
                  <div className="dashboard-match-title">
                    <Link
                      to={`/tournaments/${entry.event?.week?.id}/events/${entry.eventId}`}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {entry.event?.category} {entry.event?.ageGroup}
                    </Link>
                  </div>
                  <div className="dashboard-match-sub">
                    {entry.event?.week?.name}{entry.event?.week?.startDate ? ` · ${entry.event.week.startDate}` : ''}
                    {' · '}
                    {entry.isAlternate ? 'Alternate' : entry.drawType === 'main' ? `Main Draw #${entry.position}` : `Qualifying #${entry.position}`}
                  </div>
                </div>
                <span className={`t-badge ${entry.entryStatus === 'placed' ? '' : 'pending'}`} style={{ fontSize: 12 }}>
                  {entry.entryStatus === 'placed' ? 'Entered' : entry.entryStatus}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Player: tournament activity */}
        {role === 'player' && (
          <PlayerTournamentSections
            loading={activity.loading}
            error={activity.error}
            tournaments={activity.tournaments}
            todayMatches={activity.todayMatches}
            recentResults={activity.recentResults}
          />
        )}

        {/* Coach: roster tournament activity */}
        {role === 'coach' && (
          <CoachTournamentSections
            loading={activity.loading}
            error={activity.error}
            todayMatches={activity.todayMatches}
            recentResults={activity.recentResults}
            activeLinks={activeLinks}
          />
        )}

        {/* Player + Coach: personal tracker */}
        {role !== 'organizer' && (
          <>
            <div className="dashboard-section-title" style={{ marginTop: 20 }}>My Stats</div>
            <Link to="/track" className="dashboard-cta">
              + Track New Match
            </Link>

            {error && <div className="history-empty">{error}</div>}
            {matches === null && !error && <div className="history-empty">Loading…</div>}

            {matches !== null && (
              <>
                <div className="dashboard-stats-grid">
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-value">{matchesOnly.length}</div>
                    <div className="dashboard-stat-label">Matches</div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-value dashboard-stat-win">{wins}</div>
                    <div className="dashboard-stat-label">Wins</div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-value dashboard-stat-loss">{losses}</div>
                    <div className="dashboard-stat-label">Losses</div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-value dashboard-stat-accent">
                      {winRate !== null ? winRate + '%' : '—'}
                    </div>
                    <div className="dashboard-stat-label">Win Rate</div>
                  </div>
                  <div className="dashboard-stat">
                    <div className="dashboard-stat-value">{practices.length}</div>
                    <div className="dashboard-stat-label">Practices</div>
                  </div>
                </div>

                {recent.length > 0 && (
                  <div className="dashboard-recent">
                    <div className="dashboard-section-title">Recent Activity</div>
                    <div className="dashboard-match-list">
                      {recent.map(m => (
                        <Link to={'/history/' + m.id} key={m.id} className="dashboard-match-card">
                          <div className="dashboard-match-info">
                            <div className="dashboard-match-title">{m.selfName} vs {m.oppName}</div>
                            <div className="dashboard-match-sub">
                              {(m.tournament ? m.tournament + ' · ' : '')}{m.date || ''}
                              {m.sessionType === 'practice' ? ' · Practice' : ''}
                            </div>
                          </div>
                          <div className="dashboard-match-right">
                            {m.winner === 'self' && <span className="result-badge result-win">W</span>}
                            {m.winner === 'opp'  && <span className="result-badge result-loss">L</span>}
                            <span className="history-card-score">{m.scoreSummary}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                    {matches.length > 5 && (
                      <Link to="/history" className="dashboard-view-all">View all matches →</Link>
                    )}
                  </div>
                )}

                {matches.length === 0 && (
                  <div className="history-empty">
                    No matches yet — track your first match to see stats here.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
