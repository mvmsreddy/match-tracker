import { useEffect, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SideDrawer from '../SideDrawer';

export const COACH_TABS = [
  { id: 'groups', code: 'SG', label: 'Skill Groups' },
  { id: 'roster', code: 'RO', label: 'Roster' },
  { id: 'library', code: 'DL', label: 'Drill Library' },
  { id: 'correlation', code: 'PC', label: 'Correlation' },
  { id: 'log', code: 'LG', label: 'Log Session' },
];

const VIEW_TITLES = {
  groups: ['Skill groups', 'Roster segmented by the gap the match data actually shows'],
  detail: ['Skill group', 'Compare the group, pick a routine, assign it'],
  roster: ['Roster', 'Players linked to your coaching profile'],
  library: ['Drill library', 'Routines mapped to weaknesses, ranked by what has worked'],
  correlation: ['Progress correlation', 'Did the drills actually move the match metric?'],
  log: ['Log a session', "Quick entry — from today's assigned blocks"],
};

function weekStartIso() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

// Sidebar + topbar chrome for the Coach Intelligence System — same visual
// system as PlayerDashboardShell (the design's own consistent language),
// with a coach-appropriate nav (5 real, data-backed views instead of 6).
export default function CoachIntelligenceShell({ view, onViewChange, roster, children }) {
  const { user, logout } = useAuth();
  const { theme, setTheme, THEMES } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    <div className="pcd-root">
      <div className="pcd-sidebar">
        <div className="pcd-sidebar-brand">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{ border: 0, cursor: 'pointer', background: 'transparent', padding: 0, display: 'flex' }}
          >
            <span className="pcd-brand-chip" style={{ background: 'var(--info)' }}>CI</span>
          </button>
          <div className="pcd-brand-text">
            <div>Coach Intelligence</div>
            <div style={{ font: "400 10px/1 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 4, whiteSpace: 'nowrap' }}>
              {(user?.displayName || '').toUpperCase()}{linkedCount > 0 ? ` · ${linkedCount} PLAYER${linkedCount === 1 ? '' : 'S'}` : ''}
            </div>
          </div>
        </div>

        {COACH_TABS.map(t => (
          <button
            key={t.id}
            className={`pcd-nav-item${(view === t.id || (t.id === 'groups' && view === 'detail')) ? ' active' : ''}`}
            onClick={() => onViewChange(t.id)}
          >
            <span className="pcd-nav-chip" style={(view === t.id || (t.id === 'groups' && view === 'detail')) ? { background: 'var(--info)', color: 'var(--accent-text)' } : undefined}>{t.code}</span>
            <span className="pcd-nav-label">{t.label}</span>
          </button>
        ))}

        <div className="pcd-sidebar-week">
          <div className="pcd-sidebar-week-label">This week</div>
          <div className="pcd-sidebar-week-value">{weekSessions == null ? '—' : weekSessions.length} <span className="unit">sessions logged</span></div>
          <div className="pcd-sidebar-week-sub">{linkedCount} LINKED PLAYER{linkedCount === 1 ? '' : 'S'}</div>
        </div>
      </div>

      <div className="pcd-main">
        <div className="pcd-topbar">
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "700 24px/1.1 'Archivo', sans-serif", letterSpacing: '-.025em' }}>{title}</div>
            <div style={{ font: "400 12px/1.4 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 6 }}>{subtitle}</div>
          </div>
          <div className="pcd-topbar-actions">
            <div className="pcd-fresh-chip"><span className="pcd-fresh-dot" />ANALYTICS FRESH</div>
            <button className="pcd-btn-primary" onClick={() => onViewChange('log')}>Log a session</button>
          </div>
        </div>

        <div className="pcd-content">
          {children}
        </div>
      </div>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        logout={logout}
        theme={theme}
        setTheme={setTheme}
        THEMES={THEMES}
      />
    </div>
  );
}
