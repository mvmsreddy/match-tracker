import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

// Parent landing page — minimal read-only overview (Phase 33 foundation).
// Lists players linked via parent_player_links and hands off to the
// existing PlayerDashboardPage (viewer-mode, see LinkedPlayerDashboard in
// src/pages/PlayerDashboardPage.jsx) for the actual per-player detail —
// no separate read-only dashboard was built since that page already
// supports a non-owning viewer.
export default function ParentDashboardPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getParentLinks(user.id)
      .then(data => { if (!cancelled) setLinks(data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load linked players'); });
    return () => { cancelled = true; };
  }, [user.id]);

  const activePlayers = (links || []).filter(l => l.status === 'active').map(l => l.player).filter(Boolean);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">
          Welcome back, {(user.displayName || user.name || '').split(' ')[0]}
        </h1>
        <div className="text-sm text-muted-foreground mt-0.5">Read-only overview of your linked players</div>
      </div>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {links === null && !error && <div className="text-sm text-muted-foreground">Loading…</div>}

      {links !== null && activePlayers.length === 0 && (
        <Card className="p-6 text-center">
          <div className="text-sm text-muted-foreground mb-3">No players linked yet.</div>
          <Link to="/my-parents"><Button size="sm">Find a player →</Button></Link>
        </Card>
      )}

      {activePlayers.length > 0 && (
        <div className="space-y-2">
          {activePlayers.map(p => (
            <Link
              key={p.id}
              to={`/parent/players/${p.id}/dashboard`}
              className="flex items-center justify-between gap-3 p-4 rounded-sm border border-border bg-card hover:border-primary"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{p.displayName}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[p.aitaReg && `AITA ${p.aitaReg}`, p.stateAbbr, p.ranking && `Rank ${p.ranking}`, p.clubName].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="text-xs font-semibold text-primary shrink-0">View →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
