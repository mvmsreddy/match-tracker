import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { Trash2, Trophy, X, History, Calendar } from 'lucide-react';

export default function MatchHistoryPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all | matches | practice

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

  const filteredMatches = matches ? matches.filter(m => {
    if (filter === 'matches') return m.sessionType !== 'practice';
    if (filter === 'practice') return m.sessionType === 'practice';
    return true;
  }) : null;

  const matchCount = matches ? matches.filter(m => m.sessionType !== 'practice').length : 0;
  const practiceCount = matches ? matches.filter(m => m.sessionType === 'practice').length : 0;
  const wins = matches ? matches.filter(m => m.sessionType !== 'practice' && m.winner === 'self').length : 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          Saved Matches & Practice Sessions
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter mt-1">Match History</h1>
      </div>

      {/* Summary Cards */}
      {matches && matches.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
              <Trophy className="w-3.5 h-3.5" />
              <span>Matches</span>
            </div>
            <div className="font-display font-extrabold text-2xl tracking-tighter">{matchCount}</div>
          </Card>
          <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow bg-primary/5 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
              <Trophy className="w-3.5 h-3.5" />
              <span>Wins</span>
            </div>
            <div className="font-display font-extrabold text-2xl tracking-tighter text-accent-ink">{wins}</div>
          </Card>
          <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Practice</span>
            </div>
            <div className="font-display font-extrabold text-2xl tracking-tighter">{practiceCount}</div>
          </Card>
        </div>
      )}

      {/* Filter Chips */}
      {matches && matches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === 'all' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            All ({matches.length})
          </button>
          <button
            onClick={() => setFilter('matches')}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === 'matches' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            Matches ({matchCount})
          </button>
          <button
            onClick={() => setFilter('practice')}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === 'practice' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            Practice ({practiceCount})
          </button>
        </div>
      )}

      {error && (
        <Card className="p-6 text-center border-2 border-dashed">
          <div className="text-sm text-muted-foreground">{error}</div>
        </Card>
      )}

      {matches === null && !error && (
        <Card className="p-6 text-center border-2 border-dashed">
          <div className="text-sm text-muted-foreground">Loading match history...</div>
        </Card>
      )}

      {matches && matches.length === 0 && (
        <Card className="p-8 text-center border-2 border-dashed">
          <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">
            No matches saved yet. Generate a PDF report from the Tracker page to save a match here.
          </div>
        </Card>
      )}

      {filteredMatches && filteredMatches.length > 0 && (
        <div className="space-y-2.5">
          {filteredMatches.map((m) => {
            const isPractice = m.sessionType === 'practice';
            const isWin = m.winner === 'self';
            const isLoss = m.winner === 'opp';
            return (
              <div 
                key={m.id} 
                className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all ${
                  isWin ? 'border-l-4 border-l-primary' : isLoss ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-muted'
                }`}
              >
                <Link to={'/history/' + m.id} className="flex-1 min-w-0 flex items-center gap-3">
                  {!isPractice && (isWin || isLoss) && (
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      isWin ? 'bg-primary/10 text-accent-ink' : 'bg-destructive/10 text-destructive'
                    }`}>
                      {isWin ? 'W' : 'L'}
                    </div>
                  )}
                  {isPractice && (
                    <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{m.selfName} vs {m.oppName}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {(m.tournament ? m.tournament + ' · ' : '')}{m.date || ''} {isPractice && '· Practice'}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={'/history/' + m.id} className={`text-sm font-bold ${isWin ? 'text-accent-ink' : isLoss ? 'text-destructive' : ''}`}>
                    {m.scoreSummary}
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"
                    onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredMatches && filteredMatches.length === 0 && matches && matches.length > 0 && (
        <Card className="p-6 text-center border-2 border-dashed">
          <div className="text-sm text-muted-foreground">No {filter === 'matches' ? 'matches' : 'practice sessions'} found. Try a different filter.</div>
        </Card>
      )}
    </div>
  );
}
