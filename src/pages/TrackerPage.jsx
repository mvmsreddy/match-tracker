import { useState, useEffect } from 'react';
import { useMatchTracker } from '../hooks/useMatchTracker';
import { getWeatherString } from '../lib/weather';
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
  const [activeTab, setActiveTab] = useState('match');

  // When match ends / resets, always return to Match tab
  useEffect(() => {
    if (!t.matchStarted) setActiveTab('match');
  }, [t.matchStarted]);

  function handleStartMatch() {
    t.startMatch();
    setActiveTab('track');
  }

  return (
    <div className="root">
      <TopNav />

      {/* Scorebar only while a match is running */}
      {t.matchStarted && (
        <Scorebar
          header={t.header} sessionType={t.sessionType} pointTarget={t.pointTarget}
          engine={t.engine} nextServer={t.nextServer}
          matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
        />
      )}

      {/* Tab bar — always visible */}
      <div className="tab-bar">
        <button
          className={'tab-btn' + (activeTab === 'match' ? ' active' : '')}
          onClick={() => setActiveTab('match')}
        >
          Match
        </button>
        <button
          className={'tab-btn' + (activeTab === 'track' ? ' active' : '')}
          onClick={() => setActiveTab('track')}
          disabled={!t.matchStarted}
        >
          ● Live Track
        </button>
        <button
          className={'tab-btn' + (activeTab === 'stats' ? ' active' : '')}
          onClick={() => setActiveTab('stats')}
          disabled={!t.matchStarted}
        >
          Stats
        </button>
        <button
          className={'tab-btn' + (activeTab === 'close' ? ' active' : '')}
          onClick={() => setActiveTab('close')}
          disabled={!t.matchStarted}
          style={{
            color: !t.matchStarted ? undefined : (activeTab === 'close' ? '#C6E23D' : '#E37B6B'),
            borderBottomColor: activeTab === 'close' ? '#C6E23D' : 'transparent',
          }}
        >
          Close
        </button>
      </div>

      {/* Global status message */}
      <div className="wrap" style={{ marginTop: 4 }}><div className="status-msg">{t.status}</div></div>

      {/* ── Match tab ── */}
      {activeTab === 'match' && (
        <div className="tab-content">
          {t.matchStarted ? (
            /* Match running — show editable details + prompt to Track */
            <MatchRunningView t={t} onGoTrack={() => setActiveTab('track')} />
          ) : (
            /* No match — show new match form */
            <SetupForm t={t} onStart={handleStartMatch} />
          )}
        </div>
      )}

      {/* ── Track tab ── */}
      {activeTab === 'track' && t.matchStarted && (
        <div className="tab-content">
          <LiveTrackBar
            selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
            nextServer={t.nextServer} setServerChoice={t.setServerChoice}
            serverExplicitlyChosen={t.serverExplicitlyChosen}
            hasPoints={t.points.length > 0}
            onDelete={t.resetMatch}
          />
          {t.serverExplicitlyChosen ? (
            <Wizard
              nextServer={t.nextServer}
              onCommit={t.commitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
              selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
            />
          ) : (
            <div className="server-required-msg">Select who serves first above to begin tracking</div>
          )}
        </div>
      )}

      {/* ── Stats tab ── */}
      {activeTab === 'stats' && t.matchStarted && (
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

      {/* ── Close Match tab ── */}
      {activeTab === 'close' && t.matchStarted && (
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

// ── Match tab when a match IS running ────────────────────────────────────────
function MatchRunningView({ t, onGoTrack }) {
  return (
    <div className="setup-card">
      <div className="setup-section" style={{ marginBottom: 0 }}>
        <div className="setup-section-label" style={{ color: '#C6E23D' }}>Match in Progress</div>
        <div style={{ fontFamily: 'Inter', fontSize: '0.9rem', marginBottom: 12 }}>
          <span style={{ color: '#C6E23D', fontWeight: 600 }}>{t.header.selfName || 'You'}</span>
          {' vs '}
          <span style={{ color: '#E37B6B', fontWeight: 600 }}>{t.header.oppName || 'Opponent'}</span>
          {t.header.tournament ? <span style={{ color: '#7FA0B5' }}> · {t.header.tournament}</span> : null}
        </div>
        <div className="setup-grid-2">
          {t.header.surface && (
            <div className="field"><label>Surface</label>
              <div style={{ color: '#F3F1E6', fontFamily: 'JetBrains Mono', fontSize: '0.8rem', padding: '7px 0' }}>{t.header.surface}</div>
            </div>
          )}
          {t.header.indoorOutdoor && (
            <div className="field"><label>Indoor / Outdoor</label>
              <div style={{ color: '#F3F1E6', fontFamily: 'JetBrains Mono', fontSize: '0.8rem', padding: '7px 0' }}>{t.header.indoorOutdoor}</div>
            </div>
          )}
        </div>
      </div>
      <button className="setup-start-btn" style={{ marginTop: 16 }} onClick={onGoTrack}>
        ● Go to Track
      </button>
    </div>
  );
}

// ── New match form (shown when no match is running) ───────────────────────────
function SetupForm({ t, onStart }) {
  const selfName = t.header.selfName || '';
  const canStart = selfName.trim().length > 0;
  const [weatherLoading, setWeatherLoading] = useState(false);

  async function handleGetWeather() {
    setWeatherLoading(true);
    try {
      const w = await getWeatherString();
      t.updateHeader({ weather: w });
      t.showStatus('Weather updated');
    } catch (e) {
      t.showStatus(e.message);
    } finally {
      setWeatherLoading(false);
    }
  }

  return (
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
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Weather</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ flex: 1 }}
                placeholder="e.g. 24°C, Sunny, Wind 10 km/h"
                value={t.header.weather}
                onChange={(e) => t.updateHeader({ weather: e.target.value })}
              />
              <button
                type="button"
                className="action-btn"
                style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}
                disabled={weatherLoading}
                onClick={handleGetWeather}
              >
                {weatherLoading ? 'Locating…' : 'Get Weather'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session type */}
      <div className="setup-section">
        <div className="setup-section-label">Session Type</div>
        <div className="server-toggle" style={{ marginBottom: 0 }}>
          <div className={'chip' + (t.sessionType === 'match' ? ' selected' : '')} onClick={() => t.setSessionType('match')}>
            Match
          </div>
          <div className={'chip' + (t.sessionType === 'practice' ? ' selected' : '')} onClick={() => t.setSessionType('practice')}>
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
      <button className="setup-start-btn" disabled={!canStart} onClick={onStart}>
        {t.sessionType === 'practice' ? '▶ Start Practice' : '▶ Start Match'}
      </button>
      {!canStart && <p className="setup-hint">Enter your name to continue</p>}
    </div>
  );
}

// ── Live Track top bar: server picker + delete ────────────────────────────────
function LiveTrackBar({ selfName, oppName, nextServer, setServerChoice, serverExplicitlyChosen, hasPoints, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete();
  }

  return (
    <div className="live-track-bar">
      {/* Who serves first — only editable before any point is logged */}
      <div className={'live-track-server' + (!serverExplicitlyChosen ? ' live-track-server-required' : '')}>
        <span className={'live-track-label' + (!serverExplicitlyChosen ? ' live-track-label-required' : '')}>Serves first</span>
        <div className="server-toggle" style={{ marginBottom: 0, flex: 1 }}>
          <div
            className={'chip server-chip' + (nextServer === 'self' ? ' selected' : '') + (hasPoints ? ' disabled-chip' : '')}
            onClick={() => !hasPoints && setServerChoice('self')}
          >
            {selfName}
          </div>
          <div
            className={'chip server-chip' + (nextServer === 'opp' ? ' selected' : '') + (hasPoints ? ' disabled-chip' : '')}
            onClick={() => !hasPoints && setServerChoice('opp')}
          >
            {oppName}
          </div>
        </div>
      </div>

      {/* Delete match */}
      {confirmDelete ? (
        <div className="live-track-confirm">
          <span className="live-track-confirm-label">Delete this match?</span>
          <button className="action-btn danger confirming" onClick={handleDelete}>Yes, Delete</button>
          <button className="action-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      ) : (
        <button className="live-track-delete-btn" onClick={handleDelete}>✕ Delete Match</button>
      )}
    </div>
  );
}
