import { useEffect, useState } from 'react';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import CoachIntelligenceShell from '../components/coach/CoachIntelligenceShell';
import SkillGroupsView from '../components/coach/SkillGroupsView';
import SkillGroupDetailView from '../components/coach/SkillGroupDetailView';
import RosterView from '../components/coach/RosterView';
import DrillLibraryView from '../components/coach/DrillLibraryView';
import CorrelationView from '../components/coach/CorrelationView';
import LogSessionView from '../components/coach/LogSessionView';
import LeaderboardView from '../components/coach/LeaderboardView';

// Coach Intelligence System — replaces the old CoachPlayersPage(coach)/
// CoachPlayerDetailPage/CoachSkillGroupsPage/CoachDrillLibraryPage with the
// 5-view app from the Claude Design mockup, on the same .pcd-* visual
// system as the Player Coaching Dashboard. `roster` (every linked active
// player + their real segments, via getRosterWithSegments) is fetched once
// here and shared by every view that needs it, instead of each view
// re-fetching the same roster independently.
export default function CoachIntelligencePage() {
  const { user } = useAuth();
  const [view, setView] = useState('groups');
  const [groupKey, setGroupKey] = useState(null);
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getRosterWithSegments(user.id)
      .then(data => { if (!cancelled) setRoster(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load roster'); setRoster([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  function openGroup(key) {
    setGroupKey(key);
    setView('detail');
  }

  function changeView(next) {
    if (next !== 'detail') setGroupKey(null);
    setView(next);
  }

  return (
    <CoachIntelligenceShell view={view} onViewChange={changeView} roster={roster || []}>
      {error && <div className="history-empty">{error}</div>}
      {roster === null && !error && <div className="history-empty">Loading your roster…</div>}

      {roster !== null && (
        <>
          {view === 'groups' && (
            <SkillGroupsView
              roster={roster}
              onOpenGroup={openGroup}
              onGoLibrary={() => changeView('library')}
              onGoCorrelation={() => changeView('correlation')}
            />
          )}
          {view === 'detail' && groupKey && (
            <SkillGroupDetailView groupKey={groupKey} roster={roster} onBack={() => changeView('groups')} />
          )}
          {view === 'roster' && <RosterView roster={roster} />}
          {view === 'library' && <DrillLibraryView />}
          {view === 'correlation' && <CorrelationView />}
          {view === 'log' && <LogSessionView roster={roster} />}
          {view === 'leaderboard' && <LeaderboardView />}
        </>
      )}
    </CoachIntelligenceShell>
  );
}
