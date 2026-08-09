import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useActiveLiveSession } from '../../hooks/useLiveTrackingSpectator';
import { computeGoalPace, computeRankProgress } from '../../lib/segments';
import { getInitials as initials } from '../../lib/initials';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';

const PRIMARY_TABS = [
  { id: 'overview', label: 'Home' },
  { id: 'matches', label: 'Matches' },
  { id: 'training', label: 'Training' },
  { id: 'tournaments', label: 'History' },
];

const MORE_TABS = [
  { id: 'analytics', label: 'Match Analytics' },
  { id: 'season', label: 'Season Analytics' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'progress', label: 'Progress' },
];

const TABS = [...PRIMARY_TABS, ...MORE_TABS];

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
export default function PlayerDashboardShell({ activeTab, onTabChange, circuit, circuits, selectedKey, onSelectKey, viewPlayerId, isOwnDashboard = true, viewPlayerName, viewerRole, children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeGoal, setActiveGoal] = useState(null);
  const [coachLink, setCoachLink] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

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
  const activeLiveSession = useActiveLiveSession(!isOwnDashboard ? viewPlayerId : null);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shrink-0 shadow-sm">
            {initials(isOwnDashboard ? user?.displayName : viewPlayerName)}
          </span>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-bold flex items-center gap-2 flex-wrap">
              {isOwnDashboard ? (user?.displayName || 'Player') : (viewPlayerName || 'Player')}
              {!isOwnDashboard && <Badge variant="secondary">{viewerRole === 'parent' ? 'Parent view' : 'Coach view'}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-1">
              {circuit && (
                <span className="inline-flex items-center gap-1">
                  Ranked <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">#{circuit.latest.rank}</span>
                </span>
              )}
              {circuit && activeGoal?.targetRank && (
                <>
                  <span>→</span>
                  <span className="inline-flex items-center gap-1">
                    Target <span className="font-bold text-accent-ink bg-primary/10 px-1.5 py-0.5 rounded">#{activeGoal.targetRank}</span>
                  </span>
                </>
              )}
              {circuit && (
                <>
                  <span>·</span>
                  <span title="AITA rankings sync periodically">Synced {syncedAgo(circuit.latest.date)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {circuits?.length > 0 && (
            <div className="text-xs flex-1 min-w-32">
              <div className="text-muted-foreground uppercase tracking-wider font-bold mb-1">Detail segment</div>
              {circuits.length > 1 ? (
                <select
                  className="rounded-md border border-input bg-card px-3 py-1.5 text-sm w-full font-semibold"
                  value={selectedKey || ''}
                  onChange={e => onSelectKey(e.target.value || null)}
                  aria-label="Switch segment"
                >
                  {circuits.map(c => <option key={c.key} value={c.key}>{c.category} {c.subcategory}</option>)}
                </select>
              ) : (
                <span className="font-semibold text-sm">{circuit?.category} {circuit?.subcategory}</span>
              )}
              {circuits.length > 1 && <div className="text-muted-foreground mt-0.5 text-[12px]">{circuits.length} segments available</div>}
            </div>
          )}

          {rankProgress != null && (
            <div className="w-full sm:w-40">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground font-semibold uppercase tracking-wider">Goal progress</span>
                <span className="font-bold text-accent-ink">{rankProgress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div 
                  className="h-full rounded-full bg-primary transition-all duration-500" 
                  style={{ width: `${rankProgress}%` }} 
                />
              </div>
              {behindPace && (
                <div className="text-[12px] text-destructive mt-1 font-semibold">
                  ⚠ {isOwnDashboard ? 'Behind pace for your target date' : 'Behind pace for target date'}
                </div>
              )}
            </div>
          )}

          {isOwnDashboard && coachLink && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
              <span className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                {initials(coachLink.coach?.displayName)}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">{coachLink.coach?.displayName || 'Your coach'}</div>
                <div className="text-[12px] text-muted-foreground">Linked coach</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              className="relative w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors"
              onClick={() => onTabChange('recommendations')}
              aria-label="Recommendations"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {behindPace && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive animate-pulse" />}
            </button>
            {isOwnDashboard
              ? <Button size="sm" onClick={() => navigate('/track')}>Launch tracker</Button>
              : (
                <>
                  {activeLiveSession?.id && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/track/live/${activeLiveSession.id}`}>Watch live</Link>
                    </Button>
                  )}
                  {viewPlayerId && (
                    <Button
                      size="sm"
                      onClick={() => navigate('/track', {
                        state: {
                          trackForPlayerId: viewPlayerId,
                          trackForPlayerName: viewPlayerName || 'Player',
                        },
                      })}
                    >
                      Track for {viewPlayerName?.split(' ')[0] || 'player'}
                    </Button>
                  )}
                </>
              )}
          </div>
        </div>
      </div>

      <div className="inline-flex flex-nowrap overflow-x-auto border border-border rounded-lg p-1 bg-card gap-1 max-w-full scrollbar-hide items-center">
        {PRIMARY_TABS.map(t => (
          <button
            key={t.id}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === t.id
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            onClick={() => { onTabChange(t.id); setMoreOpen(false); }}
            data-testid={`player-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            className={`px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              MORE_TABS.some(t => t.id === activeTab)
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            onClick={() => setMoreOpen(v => !v)}
            data-testid="player-tab-more"
          >
            More ▾
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-md border border-border bg-popover shadow-lg py-1">
              {MORE_TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`block w-full text-left px-3 py-2 text-xs font-semibold hover:bg-muted ${
                    activeTab === t.id ? 'text-accent-ink' : 'text-foreground'
                  }`}
                  onClick={() => { onTabChange(t.id); setMoreOpen(false); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

export { TABS as PLAYER_DASHBOARD_TABS };
