import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '@/components/primitives/button';

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
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Saved Matches &amp; Practice Sessions</div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Match History</h1>
      </div>

      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {matches === null && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading match history...</div>
      )}

      {matches && matches.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No matches saved yet. Generate a PDF report from the Tracker page to save a match here.
        </div>
      )}

      {matches && matches.length > 0 && (
        <div className="space-y-2">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary">
              <Link to={'/history/' + m.id} className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{m.selfName} vs {m.oppName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {(m.tournament ? m.tournament + ' | ' : '')}{m.date || ''} {m.sessionType === 'practice' ? '(Practice)' : ''}
                </div>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <Link to={'/history/' + m.id} className="text-sm font-bold">{m.scoreSummary}</Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
