import { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';

// Pixel budget per point — fixed regardless of match length so long matches
// scroll horizontally instead of squeezing labels until they're unreadable.
const PX_PER_POINT = 16;
const MIN_WIDTH = 560;
const H = 130;
const PAD_X = 12;
const PAD_Y = 20;

export default function MomentumGraph({ points, selfName, oppName, analytics }) {
  const scrollRef = useRef(null);

  // Keep the latest point in view — matters most while a match is still
  // being tracked live, but also gives a finished match's report a sensible
  // default scroll position (showing how it ended) instead of the start.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points.length]);

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

  const W = Math.max(MIN_WIDTH, (data.length - 1) * PX_PER_POINT + PAD_X * 2);
  const midY = H / 2;
  const maxAbs = Math.max(1, ...data.map(Math.abs));

  const gx = (i) => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
  const gy = (v) => midY - (v / maxAbs) * (midY - PAD_Y);

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
        {/* Legend — kept outside the SVG so long names never collide with the
            chart's own boundary labels */}
        <div className="mb-1 flex items-center justify-center gap-4 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 text-accent-ink font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />{selfName}
          </span>
          <span className="inline-flex items-center gap-1.5 text-destructive font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" />{oppName}
          </span>
        </div>

        {/* Streak summary */}
        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-xs">
          <span className="text-accent-ink">{selfRecent}/{recent.length} recent</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-destructive">{oppRecent}/{recent.length} recent</span>
        </div>

        <div ref={scrollRef} className="overflow-x-auto">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
            <defs>
              <clipPath id="clip-above">
                <rect x="0" y="0" width={W} height={midY} />
              </clipPath>
              <clipPath id="clip-below">
                <rect x="0" y={midY} width={W} height={midY} />
              </clipPath>
            </defs>

            {/* Zero / neutral line */}
            <line x1={PAD_X} y1={midY} x2={W - PAD_X} y2={midY} stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4,4" />

            {/* Game boundary markers — running game score at each game's end */}
            {gameBoundaries.map((gb) => {
              const px = gx(Math.min(gb.index, data.length - 1)).toFixed(1);
              return (
                <g key={gb.index}>
                  <line x1={px} y1={PAD_Y} x2={px} y2={H - PAD_Y} stroke="var(--color-border)" strokeWidth="0.75" opacity="0.6" />
                  <text x={px} y={PAD_Y - 6} fill="var(--color-muted-foreground)" fontSize="9" fontFamily="monospace" textAnchor="middle">
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

            {/* Small point markers — exact per-point scores live in the
                Point-by-Point Log below; this chart is about shape, not detail */}
            {data.map((v, i) => (
              <circle key={i} cx={gx(i).toFixed(1)} cy={gy(v).toFixed(1)} r="1.6" fill={lineColor} opacity="0.9" />
            ))}

            {/* Current position dot */}
            <circle cx={lastX} cy={lastY} r="4.5" fill={lineColor} stroke="var(--color-card)" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="mt-1 flex items-center justify-between font-mono text-[12px] text-muted-foreground">
          <span className="text-accent-ink">&#9650; {selfName} winning</span>
          <span>point #1 &rarr; #{points.length}</span>
          <span className="text-destructive">&#9660; {oppName} winning</span>
        </div>
      </CardContent>
    </Card>
  );
}
