import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { Card } from '@/components/primitives/card';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

const METRICS = [
  { id: 'streak', label: 'Streak', value: (p) => p.streak.current, display: (p) => `${p.streak.current}d` },
  { id: 'wins', label: 'Wins', value: (p) => p.wins, display: (p) => p.wins },
  { id: 'aces', label: 'Aces', value: (p) => p.aces, display: (p) => p.aces },
  { id: 'drillMinutes', label: 'Drill min', value: (p) => p.drillMinutes, display: (p) => p.drillMinutes },
];

const RANK_STYLES = [
  'bg-amber-400/20 text-amber-500',   // 1st — gold
  'bg-slate-400/20 text-slate-400',   // 2nd — silver
  'bg-orange-700/20 text-orange-600', // 3rd — bronze
];

// Roster leaderboard — a competitive/motivational framing on top of the same
// roster data RosterView already shows diagnostically. Sourced from
// api.getRosterLeaderboard (full match/training/streak history per linked
// player, not segment-scoped like getRosterWithSegments).
export default function LeaderboardView() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [metricId, setMetricId] = useState('streak');

  useEffect(() => {
    let cancelled = false;
    api.getRosterLeaderboard(user.id)
      .then(data => { if (!cancelled) setRows(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load leaderboard'); setRows([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  if (rows === null) return <div className="text-sm text-muted-foreground">Loading leaderboard…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
        No players linked yet — use the Roster tab to find and connect with players.
      </div>
    );
  }

  const metric = METRICS.find(m => m.id === metricId);
  const sorted = [...rows].sort((a, b) => metric.value(b) - metric.value(a));

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap border border-border rounded-sm p-1 bg-card gap-1">
        {METRICS.map(m => (
          <button
            key={m.id}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
              metricId === m.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMetricId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-border">
        {sorted.map((p, i) => (
          <Link
            key={p.id}
            to={`/coach/players/${p.id}/dashboard`}
            className="flex items-center gap-3 p-3 sm:p-4 hover:bg-secondary/50"
          >
            <span className={`w-7 h-7 rounded-sm flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? RANK_STYLES[i] : 'bg-muted text-muted-foreground'}`}>
              {i + 1}
            </span>
            <span className="w-8 h-8 rounded-sm bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
              {initials(p.displayName)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.displayName}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {p.streak.current}d streak (best {p.streak.best}) &middot; {p.wins}W &middot; {p.aces} aces &middot; {p.drillMinutes} drill min
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display font-extrabold text-lg tracking-tighter">{metric.display(p)}</div>
              <div className="text-[10px] text-muted-foreground">{metric.label.toLowerCase()}</div>
            </div>
          </Link>
        ))}
      </Card>
    </div>
  );
}
