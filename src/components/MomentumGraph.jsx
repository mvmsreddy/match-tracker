export default function MomentumGraph({ points, selfName, oppName }) {
  if (points.length < 3) {
    return (
      <div className="panel">
        <h2 className="panel-title">Live Momentum</h2>
        <div className="momentum-empty">Log a few more points to see momentum</div>
      </div>
    );
  }

  // Cumulative point differential: +1 self wins, -1 opp wins
  const data = [0];
  for (const pt of points) {
    data.push(data[data.length - 1] + (pt.pointWinner === 'self' ? 1 : -1));
  }

  const W = 600;
  const H = 120;
  const PX = 8;
  const PY = 18;
  const midY = H / 2;
  const maxAbs = Math.max(1, ...data.map(Math.abs));

  const gx = (i) => PX + (i / (data.length - 1)) * (W - PX * 2);
  const gy = (v) => midY - (v / maxAbs) * (midY - PY);

  const linePts = data.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const areaPts = `${gx(0).toFixed(1)},${midY} ${linePts} ${gx(data.length - 1).toFixed(1)},${midY}`;

  const lastVal = data[data.length - 1];
  const lineColor = lastVal >= 0 ? '#C6E23D' : '#E37B6B';
  const lastX = gx(data.length - 1).toFixed(1);
  const lastY = gy(lastVal).toFixed(1);

  // Count streaks: last 5 points
  const recent = points.slice(-5);
  const selfRecent = recent.filter((p) => p.pointWinner === 'self').length;
  const oppRecent = recent.length - selfRecent;

  return (
    <div className="panel">
      <h2 className="panel-title">Live Momentum</h2>

      {/* Streak summary */}
      <div className="momentum-streak">
        <span className="self-col">{selfName}: {selfRecent}/{recent.length} recent</span>
        <span style={{ color: '#4A6478' }}>|</span>
        <span className="opp-col">{oppName}: {oppRecent}/{recent.length} recent</span>
      </div>

      <div className="momentum-graph">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="momentum-svg">
          <defs>
            <clipPath id="clip-above">
              <rect x="0" y="0" width={W} height={midY} />
            </clipPath>
            <clipPath id="clip-below">
              <rect x="0" y={midY} width={W} height={midY} />
            </clipPath>
          </defs>

          {/* Player zone labels */}
          <text x={PX} y={PY - 4} fill="#C6E23D" fontSize="9" fontFamily="monospace" opacity="0.8">
            {selfName.slice(0, 14)}
          </text>
          <text x={PX} y={H - 3} fill="#E37B6B" fontSize="9" fontFamily="monospace" opacity="0.8">
            {oppName.slice(0, 14)}
          </text>

          {/* Zero / neutral line */}
          <line x1={PX} y1={midY} x2={W - PX} y2={midY} stroke="#2C4C68" strokeWidth="1.5" strokeDasharray="4,4" />

          {/* Green fill: self is ahead */}
          <polygon points={areaPts} fill="#C6E23D" opacity="0.18" clipPath="url(#clip-above)" />
          {/* Red fill: opp is ahead */}
          <polygon points={areaPts} fill="#E37B6B" opacity="0.18" clipPath="url(#clip-below)" />

          {/* Momentum line */}
          <polyline
            points={linePts}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Current position dot */}
          <circle cx={lastX} cy={lastY} r="4" fill={lineColor} />
        </svg>
      </div>

      <div className="momentum-footer">
        <span className="self-col">▲ {selfName} winning</span>
        <span className="momentum-label">point #1 → #{points.length}</span>
        <span className="opp-col">▼ {oppName} winning</span>
      </div>
    </div>
  );
}
