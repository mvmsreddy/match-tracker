import { useEffect, useId, useRef, useState } from 'react';
import { reasonLabel } from '../lib/format';
import { cn } from '../lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';

// Pixel budget per point — fixed regardless of match length so long matches
// scroll horizontally instead of squeezing labels until they're unreadable.
const PX_PER_POINT = 20;
const MIN_WIDTH = 560;
const CHART_H = 130;
const LABEL_ROW_H = 28;
const H = CHART_H + LABEL_ROW_H;
const PAD_X = 12;
const PAD_Y = 20;

export default function MomentumGraph({ points, selfName, oppName, analytics }) {
  const scrollRef = useRef(null);
  const pointStripRef = useRef(null);
  const clipAboveId = useId();
  const clipBelowId = useId();
  // Which point's detail is shown below the chart — defaults to the latest
  // point (tap/hover any earlier point to inspect it instead).
  const [activeIdx, setActiveIdx] = useState(points.length);

  // Keep the latest point in view — matters most while a match is still
  // being tracked live, but also gives a finished match's report a sensible
  // default scroll position (showing how it ended) instead of the start.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    setActiveIdx(points.length);
  }, [points.length]);

  useEffect(() => {
    const el = scrollRef.current;
    const strip = pointStripRef.current;
    if (activeIdx <= 0) return;
    const chartTarget = el?.querySelector(`[data-chart-idx="${activeIdx}"]`);
    chartTarget?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    const chip = strip?.querySelector(`[data-point-idx="${activeIdx}"]`);
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeIdx, points.length]);

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
  const midY = CHART_H / 2;
  const maxAbs = Math.max(1, ...data.map(Math.abs));

  const gx = (i) => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
  const gy = (v) => midY - (v / maxAbs) * (midY - PAD_Y);

  const gameBoundaries = analytics?.gameBoundaries || [];

  const linePts = data.map((v, i) => `${gx(i).toFixed(1)},${gy(v).toFixed(1)}`).join(' ');
  const areaPts = `${gx(0).toFixed(1)},${midY} ${linePts} ${gx(data.length - 1).toFixed(1)},${midY}`;

  const lastVal = data[data.length - 1];
  const lineColor = lastVal >= 0 ? 'var(--color-primary)' : 'var(--color-destructive)';

  // Count streaks: last 5 points
  const recent = points.slice(-5);
  const selfRecent = recent.filter((p) => p.pointWinner === 'self').length;
  const oppRecent = recent.length - selfRecent;

  const safeActiveIdx = Math.min(activeIdx, data.length - 1);
  const activePt = safeActiveIdx > 0 ? points[safeActiveIdx - 1] : null;
  const activeDetail = activePt
    ? { score: activePt.scoreAfter, text: reasonLabel(activePt, selfName, oppName), self: activePt.endedBy === 'self' }
    : { score: '0-0', text: 'Match start', self: null };

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
              <clipPath id={clipAboveId}>
                <rect x="0" y="0" width={W} height={midY} />
              </clipPath>
              <clipPath id={clipBelowId}>
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
                  <line x1={px} y1={PAD_Y} x2={px} y2={CHART_H - PAD_Y} stroke="var(--color-border)" strokeWidth="0.75" opacity="0.6" />
                  <text x={px} y={PAD_Y - 6} fill="var(--color-muted-foreground)" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    {gb.label}
                  </text>
                </g>
              );
            })}

            {/* Brand fill: self is ahead */}
            <polygon points={areaPts} fill="var(--color-primary)" opacity="0.18" clipPath={`url(#${clipAboveId})`} />
            {/* Opp fill: opp is ahead */}
            <polygon points={areaPts} fill="var(--color-destructive)" opacity="0.18" clipPath={`url(#${clipBelowId})`} />

            {/* Momentum line */}
            <polyline
              points={linePts}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Point markers — tap/hover any point to see its detail below;
                keeps the chart itself uncluttered while still exposing every
                point that was captured. */}
            {data.map((v, i) => {
              const cx = gx(i);
              const cy = gy(v);
              const cxStr = cx.toFixed(1);
              const cyStr = cy.toFixed(1);
              const isActive = i === safeActiveIdx;
              const pt = i > 0 ? points[i - 1] : null;
              const wonSelf = pt?.pointWinner === 'self';
              const label = i === 0
                ? 'Match start'
                : `#${i} — ${pt.scoreAfter} — ${reasonLabel(pt, selfName, oppName)}`;
              const scoreLabel = pt?.scoreAfter ? String(pt.scoreAfter) : null;
              const labelY = cy - 10;
              return (
                <g
                  key={i}
                  data-chart-idx={i}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => setActiveIdx(i)}
                >
                  <title>{label}</title>
                  {/* Generous invisible hit target, small visible dot */}
                  <circle cx={cxStr} cy={cyStr} r="8" fill="transparent" />
                  {isActive && <circle cx={cxStr} cy={cyStr} r="6" fill="none" stroke={lineColor} strokeWidth="1.5" opacity="0.9" />}
                  <circle
                    cx={cxStr}
                    cy={cyStr}
                    r={isActive ? 3.2 : 2}
                    fill={pt ? (wonSelf ? 'var(--color-primary)' : 'var(--color-destructive)') : lineColor}
                    opacity={isActive ? 1 : 0.9}
                  />
                  {/* Score-after label at every point — matches PDF report behaviour */}
                  {scoreLabel && (
                    <text
                      x={cxStr}
                      y={labelY.toFixed(1)}
                      fill={isActive ? 'var(--color-foreground)' : 'var(--color-muted-foreground)'}
                      fontSize={isActive ? 8 : 7}
                      fontFamily="monospace"
                      fontWeight={isActive ? '700' : '400'}
                      textAnchor="middle"
                      transform={`rotate(-65, ${cxStr}, ${labelY.toFixed(1)})`}
                    >
                      {scoreLabel}
                    </text>
                  )}
                  {/* Point number on x-axis */}
                  <text
                    x={cxStr}
                    y={H - 6}
                    fill={isActive ? 'var(--color-foreground)' : 'var(--color-muted-foreground)'}
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight={isActive ? '700' : '400'}
                    textAnchor="middle"
                  >
                    {i === 0 ? '0' : i}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Scrollable point-by-point strip — tap any point on mobile/desktop */}
        <div
          ref={pointStripRef}
          className="mt-2 flex gap-1 overflow-x-auto pb-1"
          data-testid="momentum-point-strip"
        >
          {points.map((pt, i) => {
            const idx = i + 1;
            const isActive = idx === safeActiveIdx;
            const wonSelf = pt.pointWinner === 'self';
            return (
              <button
                key={idx}
                type="button"
                data-point-idx={idx}
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  'shrink-0 rounded border px-2 py-1 font-mono text-[10px] tabular-nums transition-colors',
                  isActive
                    ? 'border-primary bg-primary/15 text-accent-ink font-bold'
                    : 'border-border bg-secondary/60 text-muted-foreground hover:border-foreground/30',
                )}
              >
                <span className={wonSelf ? 'text-accent-ink' : 'text-destructive'}>#{idx}</span>
                <span className="mx-1 text-muted-foreground">·</span>
                <span>{pt.scoreAfter}</span>
              </button>
            );
          })}
        </div>

        {/* Active point detail — defaults to the latest point */}
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-secondary/50 px-3 py-2 text-xs">
          <span className="font-mono font-bold tabular-nums shrink-0">
            {safeActiveIdx === 0 ? 'Start' : `#${safeActiveIdx}`}
          </span>
          <span className="font-mono tabular-nums text-muted-foreground shrink-0">{activeDetail.score}</span>
          <span className={activeDetail.self === null ? 'text-muted-foreground' : activeDetail.self ? 'text-accent-ink' : 'text-destructive'}>
            {activeDetail.text}
          </span>
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
