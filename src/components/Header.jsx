import { useState, useEffect } from 'react';
import { getFormatConfig } from '../lib/constants';
import { getWeatherString } from '../lib/weather';

const SURFACES = [
  'Acrylic (Hard-Court)', 'Artificial Clay', 'Artificial Grass', 'Asphalt (Hard-Court)',
  'Carpet', 'Clay', 'Concrete (Hard-Court)', 'Grass', 'Other Surface',
];

export default function Header({
  header, updateHeader, sessionType, setSessionType,
  formatPreset, setFormatPreset, formatCustom, setFormatCustom,
  pointTarget, setPointTarget, showStatus,
}) {
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [customTargetVisible, setCustomTargetVisible] = useState(!['10', '15', '21'].includes(String(pointTarget)));

  useEffect(() => {
    if (!['10', '15', '21'].includes(String(pointTarget))) {
      setCustomTargetVisible(true);
    }
  }, [pointTarget]);

  async function handleGetWeather() {
    setWeatherLoading(true);
    try {
      const w = await getWeatherString();
      updateHeader({ weather: w });
      showStatus('Weather updated');
    } catch (e) {
      showStatus(e.message);
    } finally {
      setWeatherLoading(false);
    }
  }

  function handleTargetChip(val) {
    if (val === 'custom') {
      setCustomTargetVisible(true);
    } else {
      setCustomTargetVisible(false);
      setPointTarget(val);
    }
  }

  return (
    <div className="header">
      <div className="title-row">
        <h1 className="title">Match Tracker Pro</h1>
      </div>
      <div className="subtitle">POINT-BY-POINT LOGGING &middot; LIVE SCORING &middot; FULL PDF REPORT</div>

      <div className="info-grid">
        <div className="field"><label>Self</label><input value={header.selfName} onChange={(e) => updateHeader({ selfName: e.target.value })} /></div>
        <div className="field"><label>Opponent</label><input placeholder="Opponent name" value={header.oppName} onChange={(e) => updateHeader({ oppName: e.target.value })} /></div>
        <div className="field"><label>Tournament / Location</label><input value={header.tournament} onChange={(e) => updateHeader({ tournament: e.target.value })} /></div>
        <div className="field"><label>Date</label><input type="date" value={header.date} onChange={(e) => updateHeader({ date: e.target.value })} /></div>
      </div>

      <div className="info-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Surface</label>
          <select value={header.surface} onChange={(e) => updateHeader({ surface: e.target.value })}>
            <option value="">Not specified</option>
            {SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Indoor / Outdoor</label>
          <select value={header.indoorOutdoor} onChange={(e) => updateHeader({ indoorOutdoor: e.target.value })}>
            <option value="">Not specified</option>
            <option value="Indoor">Indoor</option>
            <option value="Outdoor">Outdoor</option>
          </select>
        </div>
        <div className="field">
          <label>Opponent handedness</label>
          <select value={header.oppHandedness} onChange={(e) => updateHeader({ oppHandedness: e.target.value })}>
            <option value="">Not specified</option>
            <option value="Right-Handed">Right-Handed</option>
            <option value="Left-Handed">Left-Handed</option>
          </select>
        </div>
        <div className="field">
          <label>Weather</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ flex: 1 }} placeholder="Tap Get Weather ->" value={header.weather} onChange={(e) => updateHeader({ weather: e.target.value })} />
            <button type="button" className="action-btn" style={{ padding: '7px 10px', whiteSpace: 'nowrap' }} disabled={weatherLoading} onClick={handleGetWeather}>
              {weatherLoading ? 'Locating...' : 'Get Weather'}
            </button>
          </div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Session type</label>
        <div className="server-toggle" style={{ marginBottom: 0 }}>
          <div className={'chip' + (sessionType === 'match' ? ' selected' : '')} onClick={() => setSessionType('match')}>Match</div>
          <div className={'chip' + (sessionType === 'practice' ? ' selected' : '')} onClick={() => setSessionType('practice')}>Practice</div>
        </div>
      </div>

      {sessionType === 'match' && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Match format</label>
          <select value={formatPreset} onChange={(e) => setFormatPreset(e.target.value)}>
            <option value="bo3-full">Best of 3 sets (full 3rd set)</option>
            <option value="bo3-mtb10">Best of 3 sets (Match Tiebreak-10 decider)</option>
            <option value="bo5-full">Best of 5 sets</option>
            <option value="proset8">Pro-set (first to 8 games)</option>
            <option value="shortsets4">Short Sets (best of 3, first to 4 games)</option>
            <option value="custom">Custom</option>
          </select>
          {formatPreset === 'custom' && (
            <input
              placeholder="Describe your custom format" style={{ marginTop: 8 }}
              value={formatCustom} onChange={(e) => setFormatCustom(e.target.value)}
            />
          )}
        </div>
      )}

      {sessionType === 'practice' && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Points target</label>
          <div className="chip-row" style={{ margin: '0 0 8px' }}>
            {[10, 15, 21].map((n) => (
              <div key={n} className={'chip' + (!customTargetVisible && pointTarget === n ? ' selected' : '')} onClick={() => handleTargetChip(n)}>Best of {n}</div>
            ))}
            <div className={'chip' + (customTargetVisible ? ' selected' : '')} onClick={() => handleTargetChip('custom')}>Custom</div>
          </div>
          {customTargetVisible && (
            <input
              type="number" min="1" placeholder="Custom point target"
              value={pointTarget} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) setPointTarget(v); }}
            />
          )}
        </div>
      )}

      <ScoringHint sessionType={sessionType} pointTarget={pointTarget} formatPreset={formatPreset} />
    </div>
  );
}

function ScoringHint({ sessionType, pointTarget, formatPreset }) {
  let text;
  if (sessionType === 'practice') {
    text = 'Practice session: race to ' + pointTarget + ' points, straight count. Server alternates automatically each game \u2014 use the toggle above to correct it if needed.';
  } else {
    const cfg = getFormatConfig(formatPreset);
    let rule = cfg.label + ', ' + cfg.gamesTarget + ' games win-by-2, tiebreak at ' + cfg.gamesTarget + '-' + cfg.gamesTarget + ' to 7.';
    if (cfg.decider === 'mtb10') rule += ' If sets reach 1-1, the decider is a 10-point Match Tiebreak (win by 2) instead of a full 3rd set.';
    text = rule + ' Server alternates automatically each game \u2014 use the toggle above to correct it if needed.';
  }
  return <div className="wrap"><div className="hint">{text}</div></div>;
}
