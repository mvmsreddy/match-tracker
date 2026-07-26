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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'training', label: 'Training' },
  { id: 'analytics', label: 'Match Analytics' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'progress', label: 'Progress' },
];

// Player Coaching Dashboard — Phase 2 of the multi-segment plan. Every tab
// below is scoped to whichever segment (AITA category/subcategory circuit)
// is selected via SegmentContext; segments are fully independent, never
// merged (see src/lib/segments.js). Training/Match Analytics/Recommendations/
// Progress are Phase 3-5 — placeholder-empty here until their data exists.
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
                {activeTab === 'training' && (
                  <div className="history-empty">Training log is coming soon (Phase 3).</div>
                )}
                {activeTab === 'analytics' && (
                  <div className="history-empty">Match Analytics is coming soon (Phase 5).</div>
                )}
                {activeTab === 'recommendations' && (
                  <div className="history-empty">Recommendations are coming soon (Phase 5).</div>
                )}
                {activeTab === 'progress' && (
                  <div className="history-empty">Progress tracking is coming soon (Phase 5).</div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
