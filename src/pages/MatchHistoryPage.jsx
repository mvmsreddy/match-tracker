import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

export default function MatchHistoryPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listMatches(user.id)
      .then((list) => { if (!cancelled) setMatches(list); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load match history'); });
    return () => { cancelled = true; };
  }, [user.id]);

  async function handleDelete(matchId) {
    if (!window.confirm('Delete this saved match? This cannot be undone.')) return;
    await api.deleteMatch(user.id, matchId);
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  }

  return (
    <div className="root">
      <TopNav />
      <div className="header">
        <h1 className="title">Match History</h1>
        <div className="subtitle">SAVED MATCHES &amp; PRACTICE SESSIONS &middot; {user.name}</div>
      </div>

      {error && <div className="history-empty">{error}</div>}

      {matches === null && !error && (
        <div className="history-empty">Loading match history...</div>
      )}

      {matches && matches.length === 0 && (
        <div className="history-empty">
          No matches saved yet. Generate a PDF report from the Tracker page to save a match here.
        </div>
      )}

      {matches && matches.length > 0 && (
        <div className="history-list">
          {matches.map((m) => (
            <div className="history-card" key={m.id}>
              <Link to={'/history/' + m.id} className="history-card-main" style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
                <div className="history-card-title">{m.selfName} vs {m.oppName}</div>
                <div className="history-card-sub">
                  {(m.tournament ? m.tournament + ' | ' : '')}{m.date || ''} {m.sessionType === 'practice' ? '(Practice)' : ''}
                </div>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link to={'/history/' + m.id} className="history-card-score" style={{ textDecoration: 'none' }}>{m.scoreSummary}</Link>
                <span className="logout-link" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>Delete</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
