import { useState } from 'react';
import { useMatchTracker } from '../hooks/useMatchTracker';
import TopNav from '../components/TopNav';
import Scorebar from '../components/Scorebar';
import Wizard from '../components/Wizard';
import StatsPanel from '../components/StatsPanel';
import PointLog from '../components/PointLog';
import ActionButtons from '../components/ActionButtons';
import MomentumGraph from '../components/MomentumGraph';

const SURFACES = [
  'Acrylic (Hard-Court)', 'Artificial Clay', 'Artificial Grass',
  'Asphalt (Hard-Court)', 'Carpet', 'Clay', 'Concrete (Hard-Court)', 'Grass', 'Other Surface',
];

export default function TrackerPage() {
  const t = useMatchTracker();
  const [activeTab, setActiveTab] = useState('track');

  // ── Setup phase ──────────────────────────────────────────────────────────
  if (!t.matchStarted) {
    return <SetupView t={t} onStart={() => { t.startMatch(); setActiveTab('track'); }} />;
  }

  // ── Tracking phase ────────────────────────────────────────────────────────
  return (
    <div className="root">
      <TopNav />

      <Scorebar
        header={t.header} sessionType={t.sessionType} pointTarget={t.pointTarget}
        engine={t.engine} nextServer={t.nextServer}
        matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
      />

      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={'tab-btn' + (activeTab === 'track' ? ' active' : '')}
          onClick={() => setActiveTab('track')}
        >
          ● Track
        </button>
        <button
          className={'tab-btn' + (activeTab === 'stats' ? ' active' : '')}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
        <button
          className={'tab-btn' + (activeTab === 'close' ? ' active' : '')}
          onClick={() => setActiveTab('close')}
          style={{ color: activeTab === 'close' ? '#C6E23D' : '#E37B6B', borderBottomColor: activeTab === 'close' ? '#C6E23D' : 'transparent' }}
        >
          Close Match
        </button>
      </div>

      {/* Global status message */}
      <div className="wrap" style={{ marginTop: 4 }}><div className="status-msg">{t.status}</div></div>

      {/* Track tab */}
      {activeTab === 'track' && (
        <div className="tab-content">
          <Wizard
            nextServer={t.nextServer} onServerChange={t.setServerChoice}
            onCommit={t.commitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
            selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
          />
        </div>
      )}

      {/* Stats tab */}
      {activeTab === 'stats' && (
        <div className="tab-content">
          <MomentumGraph
            points={t.points}
            selfName={t.header.selfName || 'Self'}
            oppName={t.header.oppName || 'Opponent'}
          />
          <StatsPanel
            points={t.points} header={t.header} sessionType={t.sessionType} analytics={t.analytics}
            section="main"
          />
          <PointLog points={t.points} header={t.header} />
          <StatsPanel
            points={t.points} header={t.header} sessionType={t.sessionType} analytics={t.analytics}
            section="shots"
          />
        </div>
      )}

      {/* Close Match tab */}
      {activeTab === 'close' && (
        <div className="tab-content">
          <ActionButtons
            header={t.header} updateHeader={t.updateHeader}
            sessionType={t.sessionType} formatPreset={t.formatPreset} formatLabel={t.formatLabel}
            pointTarget={t.pointTarget} points={t.points} engine={t.engine} analytics={t.analytics}
            matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
            showStatus={t.showStatus} resetMatch={t.resetMatch}
            matchSaved={t.matchSaved} markSaved={t.markSaved}
          />
        </div>
      )}
    </div>
  );
}

// ── Setup view ────────────────────────────────────────────────────────────────
function SetupView({ t, onStart }) {
  const selfName = t.header.selfName || '';
  const canStart = selfName.trim().length > 0;

  return (
    <div className="setup-screen">
      <TopNav />

      <div className="setup-card">
        <div className="setup-header">
          <h1 className="setup-title">Match Tracker Pro</h1>
          <p className="setup-subtitle">Enter details below to begin tracking</p>
        </div>

        {/* Players */}
        <div className="setup-section">
          <div className="setup-section-label">Players</div>
          <div className="setup-grid-2">
            <div className="field">
              <label>Your name *</label>
              <input
                placeholder="Your name"
                value={t.header.selfName}
                onChange={(e) => t.updateHeader({ selfName: e.target.value })}
                autoFocus
              />
            </div>
            <div className="field">
              <label>Opponent</label>
              <input
                placeholder="Opponent name"
                value={t.header.oppName}
                onChange={(e) => t.updateHeader({ oppName: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Match details */}
        <div className="setup-section">
          <div className="setup-section-label">Match Details</div>
          <div className="setup-grid-2">
            <div className="field">
              <label>Tournament / Location</label>
              <input
                placeholder="e.g. Club Championship"
                value={t.header.tournament}
                onChange={(e) => t.updateHeader({ tournament: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={t.header.date}
                onChange={(e) => t.updateHeader({ date: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Surface</label>
              <select value={t.header.surface} onChange={(e) => t.updateHeader({ surface: e.target.value })}>
                <option value="">Not specified</option>
                {SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Indoor / Outdoor</label>
              <select value={t.header.indoorOutdoor} onChange={(e) => t.updateHeader({ indoorOutdoor: e.target.value })}>
                <option value="">Not specified</option>
                <option value="Indoor">Indoor</option>
                <option value="Outdoor">Outdoor</option>
              </select>
            </div>
            <div className="field">
              <label>Opponent Handedness</label>
              <select value={t.header.oppHandedness} onChange={(e) => t.updateHeader({ oppHandedness: e.target.value })}>
                <option value="">Not specified</option>
                <option value="Right-Handed">Right-Handed</option>
                <option value="Left-Handed">Left-Handed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Session type */}
        <div className="setup-section">
          <div className="setup-section-label">Session Type</div>
          <div className="server-toggle" style={{ marginBottom: 0 }}>
            <div
              className={'chip' + (t.sessionType === 'match' ? ' selected' : '')}
              onClick={() => t.setSessionType('match')}
            >
              Match
            </div>
            <div
              className={'chip' + (t.sessionType === 'practice' ? ' selected' : '')}
              onClick={() => t.setSessionType('practice')}
            >
              Practice
            </div>
          </div>

          {t.sessionType === 'match' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Match Format</label>
              <select value={t.formatPreset} onChange={(e) => t.setFormatPreset(e.target.value)}>
                <option value="bo3-full">Best of 3 sets (full 3rd set)</option>
                <option value="bo3-mtb10">Best of 3 sets (Match Tiebreak-10 decider)</option>
                <option value="bo5-full">Best of 5 sets</option>
                <option value="proset8">Pro-set (first to 8 games)</option>
                <option value="shortsets4">Short Sets (best of 3, first to 4 games)</option>
              </select>
            </div>
          )}

          {t.sessionType === 'practice' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Points Target</label>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                {[10, 15, 21].map((n) => (
                  <div
                    key={n}
                    className={'chip' + (t.pointTarget === n ? ' selected' : '')}
                    onClick={() => t.setPointTarget(n)}
                  >
                    {n} pts
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          className="setup-start-btn"
          disabled={!canStart}
          onClick={onStart}
        >
          {t.sessionType === 'practice' ? '▶ Start Practice' : '▶ Start Match'}
        </button>
        {!canStart && (
          <p className="setup-hint">Enter your name to continue</p>
        )}
      </div>
    </div>
  );
}
