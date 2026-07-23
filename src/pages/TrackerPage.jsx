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
import ShotLocationHeatmap from '../components/ShotLocationHeatmap';
import AiReviewModal from '../components/AiReviewModal';
import { computeStats, computeServeStats } from '../lib/analytics';

const SURFACES = [
  'Acrylic (Hard-Court)', 'Artificial Clay', 'Artificial Grass',
  'Asphalt (Hard-Court)', 'Carpet', 'Clay', 'Concrete (Hard-Court)', 'Grass', 'Other Surface',
];

export default function TrackerPage() {
  const t = useMatchTracker();
  const [activeTab, setActiveTab] = useState('match');
  const [aiReview, setAiReview] = useState(null); // { scope: 'game'|'set'|'match' } | null

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
          header={t.header} sessionType={t.sessionType} formatPreset={t.formatPreset} pointTarget={t.pointTarget}
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

      {/* On-demand AI review — available any time there are points to review */}
      {t.matchStarted && t.points.length > 0 && (
        <div className="wrap" style={{ marginTop: 4 }}>
          <button className="action-btn" onClick={() => setAiReview({ scope: 'match' })}>
            🤖 Review with AI
          </button>
        </div>
      )}

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
          {t.gameTransition ? (
            <GameTransitionCard
              transition={t.gameTransition}
              selfName={t.header.selfName || 'You'}
              oppName={t.header.oppName || 'Opponent'}
              onContinue={t.clearTransition}
              onUndo={() => { t.undoLast(); }}
              canUndo={t.points.length > 0}
              onReview={() => setAiReview({ scope: t.gameTransition.type })}
            />
          ) : t.engine.matchOver ? (
            <MatchOverBlock
              sessionType={t.sessionType}
              selfName={t.header.selfName || 'You'}
              oppName={t.header.oppName || 'Opponent'}
              winner={t.engine.matchWinner}
              onUndo={t.undoLast}
              canUndo={t.points.length > 0}
              onGoStats={() => setActiveTab('stats')}
              onGoClose={() => setActiveTab('close')}
            />
          ) : (
            <>
              {!t.serverExplicitlyChosen && (
                <LiveTrackBar
                  selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
                  nextServer={t.nextServer} setServerChoice={t.setServerChoice}
                  serverExplicitlyChosen={t.serverExplicitlyChosen}
                  hasPoints={t.points.length > 0}
                />
              )}
              {t.serverExplicitlyChosen ? (
                <Wizard
                  nextServer={t.nextServer}
                  onCommit={t.commitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
                  selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
                  onDelete={t.resetMatch}
                />
              ) : (
                <div className="server-required-msg">Select who serves first above to begin tracking</div>
              )}
            </>
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
            analytics={t.analytics}
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
          <ShotLocationHeatmap points={t.points} selfName={t.header.selfName || 'Self'} oppName={t.header.oppName || 'Opponent'} />
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
          />
        </div>
      )}

      {aiReview && (
        <AiReviewModal
          scope={aiReview.scope}
          points={t.points}
          engine={t.engine}
          header={t.header}
          onClose={() => setAiReview(null)}
        />
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

// ── Static block shown when match/session is over and wizard must be frozen ──
function MatchOverBlock({ sessionType, selfName, oppName, winner, onUndo, canUndo, onGoStats, onGoClose }) {
  const isPractice = sessionType === 'practice';
  const winnerName = winner === 'self' ? selfName : oppName;
  return (
    <div className="match-over-block">
      <div className="match-over-block-title">
        {isPractice ? 'Session complete' : 'Match complete'}
      </div>
      <div className="match-over-block-winner">
        <span className={winner === 'self' ? 'self-name' : 'opp-name'}>{winnerName}</span>
        {isPractice ? ' wins the session' : ' wins'}
      </div>
      <div className="match-over-block-actions">
        <button className="action-btn" onClick={onGoStats}>View Stats</button>
        {!isPractice && <button className="action-btn" onClick={onGoClose}>Close Match</button>}
      </div>
      <button className="undo-btn" style={{ marginTop: 8 }} disabled={!canUndo} onClick={onUndo}>
        ↩ Undo last point
      </button>
    </div>
  );
}

// ── Game / Set / Match transition card with per-game stats ───────────────────
function GameTransitionCard({ transition, selfName, oppName, onContinue, onUndo, canUndo, onReview }) {
  const { type, winner, gamePoints, sets, setGames, nextServer } = transition;
  const winnerName = winner === 'self' ? selfName : oppName;

  const stats = computeStats(gamePoints);
  const ss = computeServeStats(gamePoints, 'self');
  const so = computeServeStats(gamePoints, 'opp');

  let headline, subline, btnLabel;
  if (type === 'match') {
    headline = `${winnerName} wins the match!`;
    subline = sets.map((s) =>
      s.isMatchTiebreak ? `[${s.tb.self}–${s.tb.opp}]` : `${s.self}–${s.opp}`
    ).join('  ');
    btnLabel = 'Continue';
  } else if (type === 'set') {
    const last = sets[sets.length - 1];
    const selfSets = sets.filter((s) => s.self > s.opp).length;
    const oppSets = sets.filter((s) => s.opp > s.self).length;
    headline = `Set ${sets.length} to ${winnerName}`;
    subline = `${last.self}–${last.opp}  ·  Sets: ${selfSets}–${oppSets}`;
    btnLabel = 'Next Set →';
  } else {
    headline = `Game to ${winnerName}`;
    subline = `${selfName} ${setGames.self}–${setGames.opp} ${oppName}`;
    btnLabel = 'Next Game →';
  }

  const hasServeData = ss.totalServicePts > 0 || so.totalServicePts > 0;

  return (
    <div className="transition-card">
      <div className="transition-header">
        <div className={`transition-headline ${winner === 'self' ? 'self-name' : 'opp-name'}`}>
          {headline}
        </div>
        <div className="transition-subline">{subline}</div>
        {type !== 'match' && nextServer && (
          <div className="transition-next-server">
            Serves next:&nbsp;
            <span className={nextServer === 'self' ? 'self-name' : 'opp-name'}>
              {nextServer === 'self' ? selfName : oppName}
            </span>
          </div>
        )}
      </div>

      <div className="transition-stats">
        <div className="transition-stats-title">This Game</div>
        <table className="stat-table">
          <tbody>
            <tr><th>Metric</th><th className="self-col">{selfName}</th><th className="opp-col">{oppName}</th></tr>
            <tr><td>Points Won</td><td className="self-col">{stats.self.pointCount}</td><td className="opp-col">{stats.opp.pointCount}</td></tr>
            <tr><td>Winners / FE</td><td className="self-col">{stats.self.wfe}</td><td className="opp-col">{stats.opp.wfe}</td></tr>
            <tr><td>Unforced Errors</td><td className="self-col">{stats.self.ue}</td><td className="opp-col">{stats.opp.ue}</td></tr>
            {hasServeData && (
              <>
                <tr><td>1st Serve %</td>
                  <td className="self-col">{ss.totalServicePts > 0 ? ss.firstPct.toFixed(0) + '%' : '—'}</td>
                  <td className="opp-col">{so.totalServicePts > 0 ? so.firstPct.toFixed(0) + '%' : '—'}</td>
                </tr>
                <tr><td>Won on 1st</td>
                  <td className="self-col">{ss.firstIn > 0 ? `${ss.wonOn1st}/${ss.firstIn}` : '—'}</td>
                  <td className="opp-col">{so.firstIn > 0 ? `${so.wonOn1st}/${so.firstIn}` : '—'}</td>
                </tr>
                <tr><td>Won on 2nd</td>
                  <td className="self-col">{ss.secondIn > 0 ? `${ss.wonOn2nd}/${ss.secondIn}` : '—'}</td>
                  <td className="opp-col">{so.secondIn > 0 ? `${so.wonOn2nd}/${so.secondIn}` : '—'}</td>
                </tr>
                {(ss.aces > 0 || so.aces > 0 || ss.dfs > 0 || so.dfs > 0) && (
                  <tr><td>Aces / DFs</td>
                    <td className="self-col">{ss.aces} / {ss.dfs}</td>
                    <td className="opp-col">{so.aces} / {so.dfs}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="transition-actions">
        <button className="undo-btn" disabled={!canUndo} onClick={onUndo}>↩ Undo</button>
        <button className="action-btn" onClick={onReview}>🤖 Review with AI</button>
        <button className="transition-continue-btn" onClick={onContinue}>{btnLabel}</button>
      </div>
    </div>
  );
}

// ── Live Track top bar: server picker + delete ────────────────────────────────
function LiveTrackBar({ selfName, oppName, nextServer, setServerChoice, serverExplicitlyChosen, hasPoints }) {
  return (
    <div className="live-track-bar">
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
    </div>
  );
}
