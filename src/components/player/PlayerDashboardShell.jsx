import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { computeRankProgress } from '../../lib/segments';
import MTNavChrome from '../nav/MTNavChrome';
import TopNav from '../TopNav';

const TABS = [
  { id: 'overview', code: 'OV', label: 'Overview' },
  { id: 'tournaments', code: 'TN', label: 'My Tournaments' },
  { id: 'training', code: 'TG', label: 'Training' },
  { id: 'analytics', code: 'AN', label: 'Match Analytics' },
  { id: 'recommendations', code: 'RC', label: 'Recommendations' },
  { id: 'progress', code: 'PG', label: 'Progress Tracker' },
];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
}

function syncedAgo(iso) {
  if (!iso) return null;
  const days = Math.max(0, Math.round((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000));
  if (days === 0) return 'TODAY';
  if (days === 1) return '1D AGO';
  return `${days}D AGO`;
}

// Topbar + in-page tab strip for the Player Coaching Dashboard mockup.
// Previously this rendered its own bespoke sidebar (a THIRD nav surface
// besides the hamburger drawer and MTNavChrome's rail, only shown here) —
// that made the left nav change shape depending on which page a player was
// on. Now it reuses the exact same MTNavChrome/TopNav chrome every other
// page renders, and the six dashboard sections (Overview/My Tournaments/
// Training/Match Analytics/Recommendations/Progress Tracker) are an in-page
// pill submenu (the same .pcd-pill-row pattern TrainingLogTab/
// SkillGroupDetailView already use) instead of a second sidebar.
export default function PlayerDashboardShell({ activeTab, onTabChange, circuit, circuits, selectedKey, onSelectKey, viewPlayerId, isOwnDashboard = true, viewPlayerName, children }) {
  const { user } = useAuth();
  const { theme } = useTheme();
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
  const behindPace = rankProgress != null && activeGoal?.targetDate
    ? (() => {
        const start = new Date(circuit.points[0].date).getTime();
        const end = new Date(activeGoal.targetDate).getTime();
        if (end <= start) return false;
        const elapsedPct = Math.round(((Date.now() - start) / (end - start)) * 100);
        return elapsedPct > rankProgress;
      })()
    : false;

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="dashboard" /> : <TopNav />}

      <div className="pcd-main">
        <div className="pcd-topbar">
          <div className="pcd-topbar-id">
            <span className="pcd-id-chip">{initials(isOwnDashboard ? user?.displayName : viewPlayerName)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="pcd-id-name">
                {isOwnDashboard ? (user?.displayName || 'Player') : (viewPlayerName || 'Player')}
                {!isOwnDashboard && <span className="pcd-badge info sm" style={{ marginLeft: 10, verticalAlign: 'middle' }}>COACH VIEW</span>}
              </div>
              <div className="pcd-id-meta">
                {circuit && <span>RANKED <span className="v">{circuit.latest.rank}</span></span>}
                {circuit && activeGoal?.targetRank && (
                  <>
                    <span className="sep">→</span>
                    <span>TARGET <span className="accent">{activeGoal.targetRank}</span></span>
                  </>
                )}
                {circuit && (
                  <>
                    <span className="sep">·</span>
                    <span title="AITA rankings sync periodically">SYNCED {syncedAgo(circuit.latest.date)}</span>
                  </>
                )}
                {circuits?.length > 1 && (
                  <select value={selectedKey || ''} onChange={e => onSelectKey(e.target.value || null)}>
                    {circuits.map(c => <option key={c.key} value={c.key}>{c.category} {c.subcategory}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>

          {rankProgress != null && (
            <div className="pcd-topbar-goal">
              <div className="pcd-topbar-goal-head">
                <div className="pcd-topbar-goal-label">Goal progress</div>
                <div className="pcd-topbar-goal-value">{rankProgress}%</div>
              </div>
              <div className="pcd-progress-track">
                <div className="pcd-progress-fill" style={{ width: `${rankProgress}%` }} />
              </div>
              {behindPace && <div className="pcd-progress-note">{isOwnDashboard ? 'BEHIND PACE FOR YOUR TARGET DATE' : 'BEHIND PACE FOR TARGET DATE'}</div>}
            </div>
          )}

          {isOwnDashboard && coachLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--border2)' }}>
              <span className="pcd-coach-chip">{initials(coachLink.coach?.displayName)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="pcd-coach-name">{coachLink.coach?.displayName || 'Your coach'}</div>
                <div className="pcd-coach-sub">LINKED COACH</div>
              </div>
            </div>
          )}

          <div className="pcd-topbar-actions">
            <button className="pcd-icon-btn" onClick={() => onTabChange('recommendations')} aria-label="Recommendations">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {behindPace && <span className="pcd-icon-btn-dot" />}
            </button>
            {isOwnDashboard && <button className="pcd-btn-primary" onClick={() => navigate('/track')}>Launch tracker</button>}
          </div>
        </div>

        <div className="pcd-content">
          <div className="pcd-pill-row" style={{ width: 'fit-content' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`pcd-pill${activeTab === t.id ? ' active' : ''}`}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

export { TABS as PLAYER_DASHBOARD_TABS };
