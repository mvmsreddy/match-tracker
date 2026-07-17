import {
  computeStats, computeGroundstrokes, computeServeStats, computeReturnStats,
} from '../lib/analytics';

function fmtRatio(r) { return r === Infinity ? '\u221e' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

export default function StatsPanel({ points, header, sessionType, analytics, section }) {
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';
  const isMatch = sessionType !== 'practice';

  const totals = computeStats(points);
  const gsSelf = computeGroundstrokes(points, 'self');
  const maxVal = Math.max(1, ...gsSelf.map((r) => Math.max(r.wfe, r.ue)));

  const ss = computeServeStats(points, 'self');
  const so = computeServeStats(points, 'opp');
  const rs = computeReturnStats(points, 'self');
  const ro = computeReturnStats(points, 'opp');

  if (section === 'shots') {
    return (
      <div className="panel">
        <h2 className="panel-title">Shot Stats &middot; Self</h2>
        <div className="bar-chart">
          {gsSelf.map((r) => (
            <div className="bar-group" key={r.stroke}>
              <div className="bar-label">{r.stroke}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: Math.max(6, r.wfe / maxVal * 100) + '%', background: '#7FBF3F' }}>{r.wfe} W/FE</div>
              </div>
              <div className="bar-track" style={{ marginTop: 3 }}>
                <div className="bar-fill" style={{ width: Math.max(6, r.ue / maxVal * 100) + '%', background: '#E1484B' }}>{r.ue} UE</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <h2 className="panel-title">Match Totals</h2>
        <table className="stat-table">
          <tbody>
            <tr><th>Metric</th><th className="self-col">{selfName}</th><th className="opp-col">{oppName}</th></tr>
            <tr><td>Winners/Forced Errors</td><td className="self-col">{totals.self.wfe}</td><td className="opp-col">{totals.opp.wfe}</td></tr>
            <tr><td>Unforced Errors</td><td className="self-col">{totals.self.ue}</td><td className="opp-col">{totals.opp.ue}</td></tr>
            <tr><td>Ratio</td><td className="self-col">{fmtRatio(totals.self.ratio)}</td><td className="opp-col">{fmtRatio(totals.opp.ratio)}</td></tr>
            <tr><td>Points Won</td><td className="self-col">{totals.self.pointCount}</td><td className="opp-col">{totals.opp.pointCount}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="panel-title">Serving Statistics</h2>
        <table className="stat-table">
          <tbody>
            <tr><th>Metric</th><th className="self-col">{selfName}</th><th className="opp-col">{oppName}</th></tr>
            {isMatch ? (
              <tr><td>Service Games</td><td className="self-col">{ss.gamesPlayed}</td><td className="opp-col">{so.gamesPlayed}</td></tr>
            ) : (
              <tr><td>Service Points</td><td className="self-col">{ss.totalServicePts}</td><td className="opp-col">{so.totalServicePts}</td></tr>
            )}
            {isMatch && (
              <>
                <tr><td>Service Games Won</td><td className="self-col">{fmtPct(ss.gamesPlayed > 0 ? analytics.svcGamesWon.self / ss.gamesPlayed * 100 : 0)}</td><td className="opp-col">{fmtPct(so.gamesPlayed > 0 ? analytics.svcGamesWon.opp / so.gamesPlayed * 100 : 0)}</td></tr>
                <tr><td>Break Points Saved</td><td className="self-col">{analytics.bp.self.savedServing}/{analytics.bp.self.facedServing}</td><td className="opp-col">{analytics.bp.opp.savedServing}/{analytics.bp.opp.facedServing}</td></tr>
              </>
            )}
            <tr><td>Aces</td><td className="self-col">{ss.aces}</td><td className="opp-col">{so.aces}</td></tr>
            <tr><td>Double Faults</td><td className="self-col">{ss.dfs}</td><td className="opp-col">{so.dfs}</td></tr>
            <tr><td>1st Serve %</td><td className="self-col">{fmtPct(ss.firstPct)}</td><td className="opp-col">{fmtPct(so.firstPct)}</td></tr>
            <tr><td>Won on 1st Serve</td><td className="self-col">{ss.wonOn1st}/{ss.firstIn}</td><td className="opp-col">{so.wonOn1st}/{so.firstIn}</td></tr>
            <tr><td>2nd Serve %</td><td className="self-col">{fmtPct(ss.secondPct)}</td><td className="opp-col">{fmtPct(so.secondPct)}</td></tr>
            <tr><td>Won on 2nd Serve</td><td className="self-col">{ss.wonOn2nd}/{ss.secondIn}</td><td className="opp-col">{so.wonOn2nd}/{so.secondIn}</td></tr>
            <tr><td>Ace/DF Ratio</td><td className="self-col">{fmtRatio(ss.ratio)}</td><td className="opp-col">{fmtRatio(so.ratio)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="panel-title">Return Statistics</h2>
        <table className="stat-table">
          <tbody>
            <tr><th>Metric</th><th className="self-col">{selfName}</th><th className="opp-col">{oppName}</th></tr>
            {isMatch ? (
              <tr><td>Return Games</td><td className="self-col">{rs.gamesPlayed}</td><td className="opp-col">{ro.gamesPlayed}</td></tr>
            ) : (
              <tr><td>Return Points</td><td className="self-col">{rs.totalReturnPts}</td><td className="opp-col">{ro.totalReturnPts}</td></tr>
            )}
            {isMatch && (
              <>
                <tr><td>Return Games Won</td><td className="self-col">{fmtPct(rs.gamesPlayed > 0 ? (rs.gamesPlayed - analytics.svcGamesWon.opp) / rs.gamesPlayed * 100 : 0)}</td><td className="opp-col">{fmtPct(ro.gamesPlayed > 0 ? (ro.gamesPlayed - analytics.svcGamesWon.self) / ro.gamesPlayed * 100 : 0)}</td></tr>
                <tr><td>Break Points Won</td><td className="self-col">{analytics.bp.self.wonReturning}/{analytics.bp.self.facedReturning}</td><td className="opp-col">{analytics.bp.opp.wonReturning}/{analytics.bp.opp.facedReturning}</td></tr>
              </>
            )}
            <tr><td>Won Returning 1st</td><td className="self-col">{rs.won1st}/{rs.total1st}</td><td className="opp-col">{ro.won1st}/{ro.total1st}</td></tr>
            <tr><td>Won Returning 2nd</td><td className="self-col">{rs.won2nd}/{rs.total2nd}</td><td className="opp-col">{ro.won2nd}/{ro.total2nd}</td></tr>
            <tr><td>Return Winners/Forced</td><td className="self-col">{rs.retWinnersForced}</td><td className="opp-col">{ro.retWinnersForced}</td></tr>
            <tr><td>Return Unforced Errors</td><td className="self-col">{rs.retUE}</td><td className="opp-col">{ro.retUE}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
