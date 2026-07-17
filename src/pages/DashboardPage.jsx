import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

export default function DashboardPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listMatches(user.id)
      .then((list) => { if (!cancelled) setMatches(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load matches'); });
    return () => { cancelled = true; };
  }, [user.id]);

  const matchesOnly = matches ? matches.filter((m) => m.sessionType !== 'practice') : [];
  const practices = matches ? matches.filter((m) => m.sessionType === 'practice') : [];
  const wins = matchesOnly.filter((m) => m.winner === 'self').length;
  const losses = matchesOnly.filter((m) => m.winner === 'opp').length;
  const winRate = matchesOnly.length > 0 ? Math.round((wins / matchesOnly.length) * 100) : null;
  const recent = matches ? matches.slice(0, 5) : [];

  return (
    <div className="root">
      <TopNav />

      <div className="dashboard-body">
        <div className="dashboard-welcome">
          <h1 className="dashboard-title">Welcome back, {user.name.split(' ')[0]}</h1>
          <div className="dashboard-subtitle">Your performance overview</div>
        </div>

        <Link to="/track" className="dashboard-cta">
          + Track New Match
        </Link>

        {error && <div className="history-empty">{error}</div>}

        {matches === null && !error && (
          <div className="history-empty">Loading...</div>
        )}

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
                  {recent.map((m) => (
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
                        {m.winner === 'opp' && <span className="result-badge result-loss">L</span>}
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
      </div>
    </div>
  );
}
