import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
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
// Main Dashboard
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';

  const [matches, setMatches]   = useState(null);
  const [links, setLinks]       = useState(null);
  const [error, setError]       = useState('');

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

  const matchesOnly = matches ? matches.filter(m => m.sessionType !== 'practice') : [];
  const practices   = matches ? matches.filter(m => m.sessionType === 'practice') : [];
  const wins        = matchesOnly.filter(m => m.winner === 'self').length;
  const losses      = matchesOnly.filter(m => m.winner === 'opp').length;
  const winRate     = matchesOnly.length > 0 ? Math.round((wins / matchesOnly.length) * 100) : null;
  const recent      = matches ? matches.slice(0, 5) : [];

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

        {/* Player + Coach: personal tracker */}
        {role !== 'organizer' && (
          <>
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
