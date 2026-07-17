import { formatGameScore } from '../lib/engine';
import { formatDuration } from '../lib/storage';
import { getFormatConfig } from '../lib/constants';

function getGameDisplay(engine, sessionType) {
  if (sessionType === 'practice') {
    return engine.gamePts.self + ' – ' + engine.gamePts.opp;
  }
  if (engine.matchOver) return 'FINAL';
  if (engine.matchTiebreakActive) {
    return engine.matchTiebreakPts.self + ' – ' + engine.matchTiebreakPts.opp + '\u00a0MTB';
  }
  return formatGameScore(engine);
}

export default function Scorebar({ header, sessionType, formatPreset, pointTarget, engine, nextServer, matchStartTime, matchDurationMs }) {
  const isPractice = sessionType === 'practice';
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';
  const gameDisplay = getGameDisplay(engine, sessionType);
  const cfg = getFormatConfig(formatPreset || 'bo3-full');
  // Max sets in match (e.g. Bo3 → 3, Bo5 → 5, proset → 1)
  const maxSets = cfg.setsToWin * 2 - 1;
  const completedSets = engine.sets.length;
  const futureSets = engine.matchOver ? 0 : Math.max(0, maxSets - completedSets - 1);

  return (
    <div className="scorebar">
      <div className="atp-board">
        {/* Left: player names + set history */}
        <div className="atp-players">
          <div className="atp-row">
            <div className="atp-name self-name">
              {nextServer === 'self' && <span className="atp-ball" />}
              {selfName}
            </div>
            {isPractice ? (
              <div className="atp-set atp-set-live" style={{ borderColor: 'var(--accent)' }}>to {pointTarget}</div>
            ) : (
              <>
                {engine.sets.map((st, i) => (
                  <div key={i} className="atp-set">
                    {st.isMatchTiebreak ? st.tb.self : st.self}
                  </div>
                ))}
                {!engine.matchOver && (
                  <div className="atp-set atp-set-live">
                    {engine.matchTiebreakActive ? engine.matchTiebreakPts.self : engine.setGames.self}
                  </div>
                )}
                {Array.from({ length: futureSets }, (_, i) => (
                  <div key={'f' + i} className="atp-set atp-set-future">-</div>
                ))}
              </>
            )}
          </div>
          <div className="atp-row" style={{ marginTop: 5 }}>
            <div className="atp-name opp-name">
              {nextServer === 'opp' && <span className="atp-ball" />}
              {oppName}
            </div>
            {isPractice ? null : (
              <>
                {engine.sets.map((st, i) => (
                  <div key={i} className="atp-set">
                    {st.isMatchTiebreak ? st.tb.opp : st.opp}
                  </div>
                ))}
                {!engine.matchOver && (
                  <div className="atp-set atp-set-live">
                    {engine.matchTiebreakActive ? engine.matchTiebreakPts.opp : engine.setGames.opp}
                  </div>
                )}
                {Array.from({ length: futureSets }, (_, i) => (
                  <div key={'f' + i} className="atp-set atp-set-future">-</div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right: big game score */}
        <div className="atp-score-block">
          <div className="atp-game-score">{gameDisplay}</div>
          <div className="atp-time">{matchStartTime ? formatDuration(matchDurationMs) : '0:00'}</div>
        </div>
      </div>

      {engine.matchOver && (
        <div className="match-over-banner">
          {(engine.matchWinner === 'self' ? selfName : oppName)}{' '}
          {isPractice ? 'wins the session' : 'wins the match'}
        </div>
      )}
    </div>
  );
}
