import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSegment } from '../context/SegmentContext';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';
import SegmentPicker from '../components/player/SegmentPicker';
import OverviewTab from '../components/player/OverviewTab';
import TournamentsTab from '../components/player/TournamentsTab';
import TrainingLogTab from '../components/player/TrainingLogTab';
import MatchAnalyticsTab from '../components/player/MatchAnalyticsTab';
import RecommendationsTab from '../components/player/RecommendationsTab';
import ProgressTab from '../components/player/ProgressTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'training', label: 'Training' },
  { id: 'analytics', label: 'Match Analytics' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'progress', label: 'Progress' },
];

// Player Coaching Dashboard — multi-segment plan (all 6 player-side tabs
// implemented: Overview/Tournaments Phase 2, Goals/Training Phase 3,
// tracker-tournament linking Phase 4, Match Analytics/Recommendations/
// Progress Phase 5). Every tab below is scoped to whichever segment (AITA
// category/subcategory circuit) is selected via SegmentContext; segments are
// fully independent, never merged (see src/lib/segments.js) — no cascading
// points logic anywhere in this feature, see the plan doc's Context section.
export default function PlayerDashboardPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { circuits, loading, error, selectedKey, setSelectedKey, selectedCircuit } = useSegment();
  const [searchParams, setSearchParams] = useSearchParams();

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
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="dashboard" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">My Dashboard</h1>
            <div className="subtitle">{user?.displayName || 'PLAYER'}</div>
          </div>
        </div>
      </div>

      {!user?.aitaReg && (
        <div className="history-empty">
          Add your AITA registration number in your profile to see segment-scoped performance.
        </div>
      )}

      {user?.aitaReg && (
        <>
          <SegmentPicker />

          {error && <div className="history-empty">{error}</div>}
          {loading && <div className="history-empty">Loading segments…</div>}

          {!loading && circuits.length === 0 && (
            <div className="history-empty">
              No ranking history found yet for reg {user.aitaReg}. Once your rankings sync, your segments will appear here.
            </div>
          )}

          {!loading && circuits.length > 0 && selectedCircuit && (
            <>
              <div className="perf-body-row">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    className={`perf-body-pill${activeTab === t.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="page-scroll">
                {activeTab === 'overview' && <OverviewTab circuit={selectedCircuit} />}
                {activeTab === 'tournaments' && <TournamentsTab circuit={selectedCircuit} />}
                {activeTab === 'training' && <TrainingLogTab circuit={selectedCircuit} />}
                {activeTab === 'analytics' && <MatchAnalyticsTab circuit={selectedCircuit} />}
                {activeTab === 'recommendations' && <RecommendationsTab circuit={selectedCircuit} />}
                {activeTab === 'progress' && <ProgressTab circuit={selectedCircuit} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
