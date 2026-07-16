import { formatGameScore } from '../lib/engine';
import { formatDuration } from '../lib/storage';

export default function Scorebar({ header, sessionType, pointTarget, engine, nextServer, matchStartTime, matchDurationMs }) {
  const isPractice = sessionType === 'practice';
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';

  return (
    <div className="scorebar">
      <div className="score-row">
        <div className="score-names">
          <span className="self-name">{selfName}</span>
          <span className="opp-name">{oppName}</span>
        </div>
        <div className="score-sets">
          {isPractice ? (
            <div className="set-chip" style={{ borderColor: '#C6E23D' }}>to {pointTarget}</div>
          ) : (
            <>
              {engine.sets.map((st, i) => (
                <div className="set-chip" key={i}>
                  {st.isMatchTiebreak ? (
                    <>[{st.tb.self}-{st.tb.opp}]</>
                  ) : (
                    <>
                      {st.self}-{st.opp}
                      {st.tiebreak && <><br /><span style={{ fontSize: '0.55rem', color: '#6E8598' }}>({st.tb.self}-{st.tb.opp})</span></>}
                    </>
                  )}
                </div>
              ))}
              <div className="set-chip" style={{ borderColor: '#C6E23D' }}>
                {engine.matchTiebreakActive ? 'MTB to 10' : (engine.setGames.self + '-' + engine.setGames.opp)}
              </div>
            </>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="score-current">
            {isPractice
              ? (engine.gamePts.self + '-' + engine.gamePts.opp)
              : (engine.matchOver ? 'FINAL' : (engine.matchTiebreakActive ? (engine.matchTiebreakPts.self + '-' + engine.matchTiebreakPts.opp + ' (MTB)') : formatGameScore(engine)))}
          </div>
          <div className="server-tag">Serving: {nextServer === 'self' ? selfName : oppName}</div>
          <div className="server-tag">Time on court: {matchStartTime ? formatDuration(matchDurationMs) : '0:00'}</div>
        </div>
      </div>
      {engine.matchOver && (
        <div className="match-over-banner">
          {(engine.matchWinner === 'self' ? selfName : oppName)} {isPractice ? 'wins the session' : 'wins the match'}
        </div>
      )}
    </div>
  );
}
