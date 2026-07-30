import { useEffect, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/primitives/button';

export const COACH_TABS = [
  { id: 'groups', label: 'Skill Groups' },
  { id: 'roster', label: 'Roster' },
  { id: 'library', label: 'Drill Library' },
  { id: 'correlation', label: 'Correlation' },
  { id: 'log', label: 'Log Session' },
  { id: 'leaderboard', label: 'Leaderboard' },
];

const VIEW_TITLES = {
  groups: ['Skill groups', 'Roster segmented by the gap the match data actually shows'],
  detail: ['Skill group', 'Compare the group, pick a routine, assign it'],
  roster: ['Roster', 'Players linked to your coaching profile'],
  library: ['Drill library', 'Routines mapped to weaknesses, ranked by what has worked'],
  correlation: ['Progress correlation', 'Did the drills actually move the match metric?'],
  log: ['Log a session', "Quick entry — from today's assigned blocks"],
  leaderboard: ['Leaderboard', 'Roster ranked by streak, wins, aces, and drill minutes'],
};

function weekStartIso() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

// Topbar + in-page tab strip for the Coach Intelligence System. Nav chrome
// (sidebar/bottom-nav) is supplied by AppShell — this only owns the
// title/actions header and the 5-view pill submenu.
export default function CoachIntelligenceShell({ view, onViewChange, roster, children }) {
  const { user } = useAuth();
  const [weekSessions, setWeekSessions] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.getTrainingSessionsLoggedByCoach(user.id, weekStartIso())
      .then(rows => { if (!cancelled) setWeekSessions(rows); })
      .catch(() => { if (!cancelled) setWeekSessions([]); });
    return () => { cancelled = true; };
  }, [user]);

  const linkedCount = (roster || []).length;
  const titleKey = view === 'detail' ? 'detail' : view;
  const [title, subtitle] = VIEW_TITLES[titleKey] || VIEW_TITLES.groups;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tighter">{title}</h1>
          <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-primary">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Analytics fresh
          </div>
          <Button size="sm" onClick={() => onViewChange('log')}>Log a session</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap border border-border rounded-sm p-1 bg-card gap-1">
          {COACH_TABS.map(t => (
            <button
              key={t.id}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
                (view === t.id || (t.id === 'groups' && view === 'detail')) ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onViewChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {weekSessions == null ? '—' : weekSessions.length} sessions logged this week &middot; {linkedCount} linked player{linkedCount === 1 ? '' : 's'}
        </div>
      </div>

      {children}
    </div>
  );
}
