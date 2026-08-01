import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';

export default function MomentumGraph({ points, selfName, oppName, analytics }) {
  if (points.length < 3) {
    return (
      <Card>
        <CardHeader><CardTitle>Live Momentum</CardTitle></CardHeader>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          Log a few more points to see momentum
        </CardContent>
      </Card>
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

  const gameBoundaries = analytics?.gameBoundaries || [];

  const linePts = data.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const areaPts = `${gx(0).toFixed(1)},${midY} ${linePts} ${gx(data.length - 1).toFixed(1)},${midY}`;

  const lastVal = data[data.length - 1];
  const lineColor = lastVal >= 0 ? 'var(--color-primary)' : 'var(--color-destructive)';
  const lastX = gx(data.length - 1).toFixed(1);
  const lastY = gy(lastVal).toFixed(1);

  // Count streaks: last 5 points
  const recent = points.slice(-5);
  const selfRecent = recent.filter((p) => p.pointWinner === 'self').length;
  const oppRecent = recent.length - selfRecent;

  return (
    <Card>
      <CardHeader><CardTitle>Live Momentum</CardTitle></CardHeader>
      <CardContent className="pt-0">
        {/* Streak summary */}
        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-xs">
          <span className="text-accent-ink">{selfName}: {selfRecent}/{recent.length} recent</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-destructive">{oppName}: {oppRecent}/{recent.length} recent</span>
        </div>

        <div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[120px] w-full">
            <defs>
              <clipPath id="clip-above">
                <rect x="0" y="0" width={W} height={midY} />
              </clipPath>
              <clipPath id="clip-below">
                <rect x="0" y={midY} width={W} height={midY} />
              </clipPath>
            </defs>

            {/* Player zone labels */}
            <text x={PX} y={PY - 4} fill="var(--color-primary)" fontSize="9" fontFamily="monospace" opacity="0.8">
              {selfName.slice(0, 14)}
            </text>
            <text x={PX} y={H - 3} fill="var(--color-destructive)" fontSize="9" fontFamily="monospace" opacity="0.8">
              {oppName.slice(0, 14)}
            </text>

            {/* Zero / neutral line */}
            <line x1={PX} y1={midY} x2={W - PX} y2={midY} stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4,4" />

            {/* Game boundary markers */}
            {gameBoundaries.map((gb) => {
              const px = gx(Math.min(gb.index, data.length - 1)).toFixed(1);
              return (
                <g key={gb.index}>
                  <line x1={px} y1={PY} x2={px} y2={H - PY} stroke="var(--color-border)" strokeWidth="0.75" opacity="0.6" />
                  <text x={px} y={PY - 4} fill="var(--color-muted-foreground)" fontSize="7" fontFamily="monospace" textAnchor="middle">
                    {gb.label}
                  </text>
                </g>
              );
            })}

            {/* Brand fill: self is ahead */}
            <polygon points={areaPts} fill="var(--color-primary)" opacity="0.18" clipPath="url(#clip-above)" />
            {/* Opp fill: opp is ahead */}
            <polygon points={areaPts} fill="var(--color-destructive)" opacity="0.18" clipPath="url(#clip-below)" />

            {/* Momentum line */}
            <polyline
              points={linePts}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Point-level markers: small tick + score label (e.g. 0-15, 15-30) at every point */}
            {data.map((v, i) => {
              const px = gx(i).toFixed(1);
              const py = gy(v);
              const tickTop = (py - 4).toFixed(1);
              const tickBottom = (py + 4).toFixed(1);
              const label = i === 0 ? null : points[i - 1].scoreAfter;
              return (
                <g key={i}>
                  <line x1={px} y1={tickTop} x2={px} y2={tickBottom} stroke="var(--color-muted-foreground)" strokeWidth="0.6" opacity="0.6" />
                  <circle cx={px} cy={py.toFixed(1)} r="1.2" fill={lineColor} opacity="0.9" />
                  {label && (
                    <text
                      x={px}
                      y={tickTop}
                      transform={`rotate(-90 ${px} ${tickTop})`}
                      fontSize="4.5"
                      fill="var(--color-muted-foreground)"
                      fontFamily="monospace"
                      textAnchor="start"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Current position dot */}
            <circle cx={lastX} cy={lastY} r="4" fill={lineColor} />
          </svg>
        </div>

        <div className="mt-1 flex items-center justify-between font-mono text-[12px] text-muted-foreground">
          <span className="text-accent-ink">▲ {selfName} winning</span>
          <span>point #1 → #{points.length}</span>
          <span className="text-destructive">▼ {oppName} winning</span>
        </div>
      </CardContent>
    </Card>
  );
}
