import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Users, ChevronRight, UserPlus } from 'lucide-react';

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
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">
          <Users className="w-3.5 h-3.5" />
          Parent Portal
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">
          Welcome back, {(user.displayName || user.name || '').split(' ')[0]}
        </h1>
        <div className="text-sm text-muted-foreground mt-1">Read-only overview of your linked players</div>
      </div>

      {error && <Card className="p-4 text-sm text-muted-foreground border-2 border-dashed">{error}</Card>}
      {links === null && !error && (
        <Card className="p-6 text-center border-2 border-dashed">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </Card>
      )}

      {links !== null && activePlayers.length === 0 && (
        <Card className="p-8 text-center border-2 border-dashed">
          <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <div className="text-sm text-muted-foreground mb-4">No players linked yet.</div>
          <Link to="/my-parents"><Button size="sm">Find a player →</Button></Link>
        </Card>
      )}

      {activePlayers.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Linked Players ({activePlayers.length})
          </div>
          <div className="space-y-2.5">
            {activePlayers.map(p => {
              const initials = (p.displayName || '').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
              return (
                <Link
                  key={p.id}
                  to={`/parent/players/${p.id}/dashboard`}
                  className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="shrink-0 w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {initials || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{p.displayName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {[p.aitaReg && `AITA ${p.aitaReg}`, p.stateAbbr, p.ranking && `Rank ${p.ranking}`, p.clubName].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
