import { reasonLabel } from '../lib/format';

export default function PointLog({ points, header }) {
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';

  return (
    <div className="panel">
      <h2 className="panel-title">Point-by-Point Log</h2>
      <div className="log-scroll">
        <table className="log-table">
          <thead>
            <tr><th>Score</th><th>Detail</th><th>Rally</th></tr>
          </thead>
          <tbody>
            {points.slice().reverse().map((pt, i) => (
              <tr key={points.length - 1 - i}>
                <td>{String(pt.scoreAfter)}</td>
                <td className={pt.endedBy === 'self' ? 'log-self' : 'log-opp'}>{reasonLabel(pt, selfName, oppName)}</td>
                <td>{pt.rally}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
