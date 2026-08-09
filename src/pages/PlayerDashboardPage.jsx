import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SegmentProvider, useSegment } from '../context/SegmentContext';
import * as api from '../api';
import { computeGoalPace, resolveDefaultCircuitKey } from '../lib/segments';
import { useMyTournaments } from '../hooks/useMyTournaments';
import { useNativeCircuitKey } from '../hooks/usePlayerActivity';
import { usePlayerProfileReadiness } from '../hooks/usePlayerProfileReadiness';
import PlayerDashboardShell from '../components/player/PlayerDashboardShell';
import SegmentOverviewPanel from '../components/player/SegmentOverviewPanel';
import ActivityGoalPanel from '../components/player/ActivityGoalPanel';
import OverviewTab from '../components/player/OverviewTab';
import TournamentsTab from '../components/player/TournamentsTab';
import MyMatchesTab from '../components/player/MyMatchesTab';
import TrainingLogTab from '../components/player/TrainingLogTab';
import MatchAnalyticsTab from '../components/player/MatchAnalyticsTab';
import SeasonAnalyticsTab from '../components/player/SeasonAnalyticsTab';
import RecommendationsTab from '../components/player/RecommendationsTab';
import ProgressTab from '../components/player/ProgressTab';
import TodayPanel from '../components/player/TodayPanel';

// Player Coaching Dashboard — multi-segment plan (all player-side tabs
// implemented: Overview/Tournaments Phase 2, Goals/Training Phase 3,
// tracker-tournament linking Phase 4, Match Analytics/Recommendations/
// Progress Phase 5), visually rebuilt to match the "Player Coaching
// Dashboard" Claude Design mockup — sidebar+topbar chrome lives in
// PlayerDashboardShell, restyled per-tab card layouts live in each tab
// component. Every tab below is scoped to whichever segment (AITA
// category/subcategory circuit) is selected via SegmentContext; segments are
// fully independent, never merged (see src/lib/segments.js) — no cascading
// points logic anywhere in this feature, see the plan doc's Context section.
// (The full-performance-browse capability that used to live here as a
// separate tab was folded into the Overview tab below — segments are
// switchable right there via the topbar's segment selector.)
//
// Also reused, read-mostly, by the Coach Intelligence System's Roster
// "DASHBOARD →" link (route /coach/players/:playerId/dashboard) — the exact
// same tabs/data a player sees for themselves, scoped to a linked player
// instead. `playerId` is only present on that route.
function PlayerDashboardInner({ viewPlayerId, isOwnDashboard, viewPlayerName, viewerRole, viewPlayerProfile }) {
  const { user } = useAuth();
  const { circuits, loading, error, selectedKey, setSelectedKey, selectedCircuit } = useSegment();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allMatches, setAllMatches] = useState(null);
  const myTournaments = useMyTournaments(viewPlayerId);
  const profileReadiness = usePlayerProfileReadiness(isOwnDashboard ? user : viewPlayerProfile);
  const nativeCircuitKey = useNativeCircuitKey(
    isOwnDashboard ? user?.dateOfBirth : viewPlayerProfile?.dateOfBirth,
    isOwnDashboard ? user?.gender : viewPlayerProfile?.gender,
  );
  const selfName = isOwnDashboard ? (user?.displayName || 'You') : (viewPlayerName || 'Player');

  useEffect(() => {
    if (!viewPlayerId) return;
    let cancelled = false;
    api.listMatches(viewPlayerId)
      .then((rows) => { if (!cancelled) setAllMatches(rows); })
      .catch(() => { if (!cancelled) setAllMatches([]); });
    return () => { cancelled = true; };
  }, [viewPlayerId]);

  useEffect(() => {
    if (!selectedKey && circuits.length > 0) {
      setSelectedKey(resolveDefaultCircuitKey(circuits, {
        dateOfBirth: isOwnDashboard ? user?.dateOfBirth : viewPlayerProfile?.dateOfBirth,
        gender: isOwnDashboard ? user?.gender : viewPlayerProfile?.gender,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuits, selectedKey, user?.dateOfBirth, user?.gender, viewPlayerProfile?.dateOfBirth, viewPlayerProfile?.gender]);

  const [rankGoalPace, setRankGoalPace] = useState(null);
  useEffect(() => {
    if (!viewPlayerId || !selectedCircuit) {
      setRankGoalPace(null);
      return;
    }
    let cancelled = false;
    api.getRankingGoals(viewPlayerId, selectedCircuit.category, selectedCircuit.subcategory)
      .then((goals) => {
        if (cancelled) return;
        const active = (goals || []).find((g) => g.status === 'active');
        setRankGoalPace(active ? computeGoalPace(selectedCircuit, active) : null);
      })
      .catch(() => { if (!cancelled) setRankGoalPace(null); });
    return () => { cancelled = true; };
  }, [viewPlayerId, selectedCircuit?.key]);

  const VALID_TABS = new Set(['overview', 'tournaments', 'matches', 'training', 'analytics', 'season', 'recommendations', 'progress']);
  const rawTab = searchParams.get('tab') || 'overview';
  const activeTab = VALID_TABS.has(rawTab) ? rawTab : 'overview';
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
      viewerRole={viewerRole}
    >
      <TodayPanel playerId={viewPlayerId} circuit={selectedCircuit} isOwnDashboard={isOwnDashboard} />

      {!loading && circuits.length > 0 && (
        <>
          <SegmentOverviewPanel
            circuits={circuits}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            playerId={viewPlayerId}
            nativeCircuitKey={nativeCircuitKey}
            myTournamentItems={myTournaments.items}
            allMatches={allMatches || []}
            aitaReg={isOwnDashboard ? user?.aitaReg : viewPlayerProfile?.aitaReg}
            isOwnDashboard={isOwnDashboard}
          />
          <ActivityGoalPanel
            playerId={viewPlayerId}
            isOwnDashboard={isOwnDashboard}
            rankBehindPace={rankGoalPace?.behindPace ?? false}
            profileComplete={profileReadiness.isReady}
          />
        </>
      )}

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
          {activeTab === 'overview' && <OverviewTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} selfName={selfName} onTabChange={setActiveTab} />}
          {activeTab === 'tournaments' && <TournamentsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} selfName={selfName} />}
          {activeTab === 'matches' && <MyMatchesTab playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'training' && <TrainingLogTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'analytics' && <MatchAnalyticsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'season' && <SeasonAnalyticsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'recommendations' && <RecommendationsTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
          {activeTab === 'progress' && <ProgressTab circuit={selectedCircuit} playerId={viewPlayerId} isOwnDashboard={isOwnDashboard} />}
        </>
      )}
    </PlayerDashboardShell>
  );
}

export default function PlayerDashboardPage() {
  const { playerId } = useParams(); // only present on /coach/players/:playerId/dashboard and /parent/players/:playerId/dashboard
  const { user } = useAuth();

  if (!playerId) {
    return <PlayerDashboardInner viewPlayerId={user.id} isOwnDashboard viewPlayerName={user.displayName} />;
  }

  return <LinkedPlayerDashboard viewerId={user.id} viewerRole={user.role} playerId={playerId} />;
}

// Resolves the viewed player's aitaReg via the viewer's own active links
// (no extra table needed — getCoachLinks/getParentLinks already join the
// player profile), confirms the viewer is actually linked+active to this
// player (via coach_player_links for a coach, parent_player_links for a
// parent — see Phase 33), then mounts a SECOND, nested SegmentProvider
// scoped to that player's ranking history instead of the app-wide one
// (which always reads the logged-in user).
function LinkedPlayerDashboard({ viewerId, viewerRole, playerId }) {
  const [state, setState] = useState({ loading: true, player: null });
  const isParentViewer = viewerRole === 'parent';

  useEffect(() => {
    let cancelled = false;
    const fetchLinks = isParentViewer ? api.getParentLinks : api.getCoachLinks;
    fetchLinks(viewerId)
      .then(links => {
        if (cancelled) return;
        const link = (links || []).find(l => {
          if (l.status !== 'active' || l.playerId !== playerId) return false;
          return isParentViewer ? l.parentId === viewerId : l.coachId === viewerId;
        });
        setState({ loading: false, player: link?.player || null });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, player: null }); });
    return () => { cancelled = true; };
  }, [viewerId, isParentViewer, playerId]);

  if (state.loading) return <div className="px-4 lg:px-8 py-6 text-sm text-muted-foreground">Loading player…</div>;
  if (!state.player) {
    return (
      <div className="px-4 lg:px-8 py-6 text-sm text-muted-foreground">
        {isParentViewer ? "This player isn't linked to your parent profile." : "This player isn't linked to your coaching profile."}
      </div>
    );
  }

  return (
    <SegmentProvider overrideAitaReg={state.player.aitaReg}>
      <PlayerDashboardInner
        viewPlayerId={playerId}
        isOwnDashboard={false}
        viewPlayerName={state.player.displayName}
        viewerRole={viewerRole}
        viewPlayerProfile={state.player}
      />
    </SegmentProvider>
  );
}
