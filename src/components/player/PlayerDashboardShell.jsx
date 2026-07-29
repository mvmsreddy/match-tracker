import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeGoalPace, computeRankProgress } from '../../lib/segments';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'My Performance' },
  { id: 'tournaments', label: 'My Tournaments' },
  { id: 'matches', label: 'My Matches' },
  { id: 'training', label: 'Training' },
  { id: 'analytics', label: 'Match Analytics' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'progress', label: 'Progress Tracker' },
];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

function syncedAgo(iso) {
  if (!iso) return null;
  const days = Math.max(0, Math.round((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// Topbar + in-page tab strip for the Player Coaching Dashboard. Nav chrome
// (sidebar/bottom-nav) is supplied by AppShell — this only owns the
// identity/segment/goal header and the 8-section pill submenu.
export default function PlayerDashboardShell({ activeTab, onTabChange, circuit, circuits, selectedKey, onSelectKey, viewPlayerId, isOwnDashboard = true, viewPlayerName, children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeGoal, setActiveGoal] = useState(null);
  const [coachLink, setCoachLink] = useState(null);

  useEffect(() => {
    if (!viewPlayerId || !circuit) return;
    let cancelled = false;
    api.getRankingGoals(viewPlayerId, circuit.category, circuit.subcategory)
      .then(goals => { if (!cancelled) setActiveGoal((goals || []).find(g => g.status === 'active') || null); })
      .catch(() => { if (!cancelled) setActiveGoal(null); });
    return () => { cancelled = true; };
  }, [viewPlayerId, circuit?.key]);

  // The "linked coach" card only makes sense on a player's own view of their
  // own dashboard — irrelevant (and potentially confusing) when a coach is
  // browsing a player's dashboard from the Coach Intelligence System.
  useEffect(() => {
    if (!user || !isOwnDashboard) return;
    let cancelled = false;
    api.getCoachLinks(user.id)
      .then(links => {
        if (cancelled) return;
        const active = (links || []).find(l => l.status === 'active' && l.playerId === user.id);
        setCoachLink(active || null);
      })
      .catch(() => { if (!cancelled) setCoachLink(null); });
    return () => { cancelled = true; };
  }, [user, isOwnDashboard]);

  const rankProgress = circuit && activeGoal?.targetRank
    ? computeRankProgress(circuit.points[0]?.rank, circuit.latest.rank, activeGoal.targetRank)
    : null;
  const goalPace = circuit && activeGoal ? computeGoalPace(circuit, activeGoal) : null;
  const behindPace = goalPace?.behindPace ?? false;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-sm bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
            {initials(isOwnDashboard ? user?.displayName : viewPlayerName)}
          </span>
          <div className="min-w-0">
            <div className="text-base font-bold flex items-center gap-2 flex-wrap">
              {isOwnDashboard ? (user?.displayName || 'Player') : (viewPlayerName || 'Player')}
              {!isOwnDashboard && <Badge variant="secondary">Coach view</Badge>}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
              {circuit && <span>Ranked <span className="font-bold text-foreground">{circuit.latest.rank}</span></span>}
              {circuit && activeGoal?.targetRank && (
                <>
                  <span>&rarr;</span>
                  <span>Target <span className="font-bold text-primary">{activeGoal.targetRank}</span></span>
                </>
              )}
              {circuit && (
                <>
                  <span>&middot;</span>
                  <span title="AITA rankings sync periodically">Synced {syncedAgo(circuit.latest.date)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {circuits?.length > 0 && (
            <div className="text-xs">
              <div className="text-muted-foreground uppercase tracking-wider font-bold mb-1">Viewing</div>
              {circuits.length > 1 ? (
                <select
                  className="rounded-sm border border-input bg-transparent px-2 py-1 text-sm"
                  value={selectedKey || ''}
                  onChange={e => onSelectKey(e.target.value || null)}
                  aria-label="Switch segment"
                >
                  {circuits.map(c => <option key={c.key} value={c.key}>{c.category} {c.subcategory}</option>)}
                </select>
              ) : (
                <span className="font-semibold">{circuit?.category} {circuit?.subcategory}</span>
              )}
              {circuits.length > 1 && <div className="text-muted-foreground mt-0.5">{circuits.length} segments</div>}
            </div>
          )}

          {rankProgress != null && (
            <div className="w-40">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Goal progress</span>
                <span className="font-bold">{rankProgress}%</span>
              </div>
              <div className="h-2 rounded-sm bg-muted">
                <div className="h-full rounded-sm bg-primary" style={{ width: `${rankProgress}%` }} />
              </div>
              {behindPace && (
                <div className="text-[10px] text-destructive mt-1">
                  {isOwnDashboard ? 'Behind pace for your target date' : 'Behind pace for target date'}
                </div>
              )}
            </div>
          )}

          {isOwnDashboard && coachLink && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-border bg-card">
              <span className="w-7 h-7 rounded-sm bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                {initials(coachLink.coach?.displayName)}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{coachLink.coach?.displayName || 'Your coach'}</div>
                <div className="text-[10px] text-muted-foreground">Linked coach</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              className="relative w-9 h-9 rounded-sm border border-border flex items-center justify-center hover:bg-secondary"
              onClick={() => onTabChange('recommendations')}
              aria-label="Recommendations"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {behindPace && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive" />}
            </button>
            {isOwnDashboard && <Button size="sm" onClick={() => navigate('/track')}>Launch tracker</Button>}
          </div>
        </div>
      </div>

      <div className="inline-flex flex-wrap border border-border rounded-sm p-1 bg-card gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}

export { TABS as PLAYER_DASHBOARD_TABS };
