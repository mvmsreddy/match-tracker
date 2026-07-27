import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SegmentProvider, useSegment } from '../context/SegmentContext';
import * as api from '../api';
import PlayerDashboardShell from '../components/player/PlayerDashboardShell';
import OverviewTab from '../components/player/OverviewTab';
import TournamentsTab from '../components/player/TournamentsTab';
import TrainingLogTab from '../components/player/TrainingLogTab';
import MatchAnalyticsTab from '../components/player/MatchAnalyticsTab';
import RecommendationsTab from '../components/player/RecommendationsTab';
import ProgressTab from '../components/player/ProgressTab';

// Player Coaching Dashboard — multi-segment plan (all 6 player-side tabs
// implemented: Overview/Tournaments Phase 2, Goals/Training Phase 3,
// tracker-tournament linking Phase 4, Match Analytics/Recommendations/
// Progress Phase 5), visually rebuilt to match the "Player Coaching
// Dashboard" Claude Design mockup — sidebar+topbar chrome lives in
// PlayerDashboardShell, restyled per-tab card layouts live in each tab
// component. Every tab below is scoped to whichever segment (AITA
// category/subcategory circuit) is selected via SegmentContext; segments are
// fully independent, never merged (see src/lib/segments.js) — no cascading
// points logic anywhere in this feature, see the plan doc's Context section.
//
// Also reused, read-mostly, by the Coach Intelligence System's Roster
// "DASHBOARD →" link (route /coach/players/:playerId/dashboard) — the exact
// same tabs/data a player sees for themselves, scoped to a linked player
// instead. `playerId` is only present on that route.
function PlayerDashboardInner({ viewPlayerId, isOwnDashboard, viewPlayerName }) {
  const { user } = useAuth();
  const { circuits, loading, error, selectedKey, setSelectedKey, selectedCircuit } = useSegment();
  const [searchParams, setSearchParams] = useSearchParams();
  const selfName = isOwnDashboard ? (user?.displayName || 'You') : (viewPlayerName || 'Player');

  // Land on the most recently active segment by default instead of an empty
  // state — circuits is already sorted most-recent-first (see segments.js).
  useEffect(() => {
    if (!selectedKey && circuits.length > 0) setSelectedKey(circuits[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuits, selectedKey]);

  const activeTab = searchParams.get('tab') || 'overview';
  function setActiveTab(tabId) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabId);
      return next;
    }, { replace: true });
  }

  return (
    <PlayerDashboardShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      circuit={selectedCircuit}
      circuits={circuits}
      selectedKey={selectedKey}
      onSelectKey={setSelectedKey}
      viewPlayerId={viewPlayerId}
      isOwnDashboard={isOwnDashboard}
      viewPlayerName={viewPlayerName}
    >
      {isOwnDashboard && error && <div className="history-empty">{error}</div>}
      {loading && <div className="history-empty">Loading segments…</div>}

      {!loading && circuits.length === 0 && (
        <div className="history-empty">
          {isOwnDashboard
            ? 'No ranking history found yet. Once your rankings sync, your segments will appear here.'
            : `No ranking history found yet for ${viewPlayerName || 'this player'}.`}
        </div>
      )}

      {!loading && circuits.length > 0 && selectedCircuit && (
        <>
          {activeTab === 'overview' && <OverviewTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} selfName={selfName} />}
          {activeTab === 'tournaments' && <TournamentsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} selfName={selfName} />}
          {activeTab === 'training' && <TrainingLogTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'analytics' && <MatchAnalyticsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'recommendations' && <RecommendationsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'progress' && <ProgressTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
        </>
      )}
    </PlayerDashboardShell>
  );
}

export default function PlayerDashboardPage() {
  const { playerId } = useParams(); // only present on /coach/players/:playerId/dashboard
  const { user } = useAuth();

  if (!playerId) {
    return <PlayerDashboardInner viewPlayerId={user.id} isOwnDashboard viewPlayerName={user.displayName} />;
  }

  return <CoachViewedPlayerDashboard coachId={user.id} playerId={playerId} />;
}

// Resolves the viewed player's aitaReg via the coach's own active links
// (no extra table needed — getCoachLinks already joins the player profile),
// confirms the coach is actually linked+active to this player, then mounts
// a SECOND, nested SegmentProvider scoped to that player's ranking history
// instead of the app-wide one (which always reads the logged-in user).
function CoachViewedPlayerDashboard({ coachId, playerId }) {
  const [state, setState] = useState({ loading: true, player: null });

  useEffect(() => {
    let cancelled = false;
    api.getCoachLinks(coachId)
      .then(links => {
        if (cancelled) return;
        const link = (links || []).find(l => l.status === 'active' && l.coachId === coachId && l.playerId === playerId);
        setState({ loading: false, player: link?.player || null });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, player: null }); });
    return () => { cancelled = true; };
  }, [coachId, playerId]);

  if (state.loading) return <div className="pcd-root"><div className="history-empty">Loading player…</div></div>;
  if (!state.player) return <div className="pcd-root"><div className="history-empty">This player isn't linked to your coaching profile.</div></div>;

  return (
    <SegmentProvider overrideAitaReg={state.player.aitaReg}>
      <PlayerDashboardInner viewPlayerId={playerId} isOwnDashboard={false} viewPlayerName={state.player.displayName} />
    </SegmentProvider>
  );
}
