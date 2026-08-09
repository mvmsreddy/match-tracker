import { useEffect, useId, useRef, useState } from 'react';
import { reasonLabel } from '../lib/format';
import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';

const PX_PER_POINT = 20;
const MIN_WIDTH = 560;
const H = 130;
const PAD_X = 12;
const PAD_Y = 20;

export default function MomentumGraph({ points, selfName, oppName, analytics }) {
  const scrollRef = useRef(null);
  const clipAboveId = useId();
  const clipBelowId = useId();
  const [activeIdx, setActiveIdx] = useState(points.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    setActiveIdx(points.length);
  }, [points.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || activeIdx <= 0) return;
    const chartTarget = el.querySelector(`[data-chart-idx="${activeIdx}"]`);
    chartTarget?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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

  const recent = points.slice(-5);
  const selfRecent = recent.filter((p) => p.pointWinner === 'self').length;
  const oppRecent = recent.length - selfRecent;

  const safeActiveIdx = Math.min(activeIdx, data.length - 1);
  const activePt = safeActiveIdx > 0 ? points[safeActiveIdx - 1] : null;

  return (
    <Card>
      <CardHeader><CardTitle>Live Momentum</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="mb-1 flex items-center justify-center gap-4 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 text-accent-ink font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />{selfName} point won
          </span>
          <span className="inline-flex items-center gap-1.5 text-destructive font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" />{oppName} point won
          </span>
        </div>

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

            <line x1={PAD_X} y1={midY} x2={W - PAD_X} y2={midY} stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4,4" />

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

            <polygon points={areaPts} fill="var(--color-primary)" opacity="0.18" clipPath={`url(#${clipAboveId})`} />
            <polygon points={areaPts} fill="var(--color-destructive)" opacity="0.18" clipPath={`url(#${clipBelowId})`} />

            {/* Segment-colored line: green when momentum rises, red when it falls */}
            {data.slice(1).map((v, i) => {
              const idx = i + 1;
              const prev = data[i];
              const rising = v > prev;
              const color = rising ? 'var(--color-primary)' : 'var(--color-destructive)';
              return (
                <line
                  key={idx}
                  x1={gx(i).toFixed(1)}
                  y1={gy(prev).toFixed(1)}
                  x2={gx(idx).toFixed(1)}
                  y2={gy(v).toFixed(1)}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            })}

            {data.map((v, i) => {
              const cx = gx(i);
              const cy = gy(v);
              const cxStr = cx.toFixed(1);
              const cyStr = cy.toFixed(1);
              const isActive = i === safeActiveIdx;
              const pt = i > 0 ? points[i - 1] : null;
              const wonSelf = pt?.pointWinner === 'self';
              const dotColor = pt
                ? (wonSelf ? 'var(--color-primary)' : 'var(--color-destructive)')
                : 'var(--color-muted-foreground)';
              const detailText = pt ? reasonLabel(pt, selfName, oppName) : 'Match start';
              const calloutAbove = cy > midY;
              const boxW = 148;
              const boxH = 30;
              const boxX = Math.max(PAD_X, Math.min(cx - boxW / 2, W - PAD_X - boxW));
              const boxY = calloutAbove ? cy - boxH - 8 : cy + 8;
              const textX = boxX + 6;

              return (
                <g
                  key={i}
                  data-chart-idx={i}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => setActiveIdx(i)}
                >
                  <title>
                    {i === 0 ? 'Match start' : `#${i} — ${pt.scoreAfter} — ${detailText}`}
                  </title>
                  <circle cx={cxStr} cy={cyStr} r="9" fill="transparent" />
                  {isActive && (
                    <circle cx={cxStr} cy={cyStr} r="6.5" fill="none" stroke={dotColor} strokeWidth="2" opacity="0.95" />
                  )}
                  <circle
                    cx={cxStr}
                    cy={cyStr}
                    r={isActive ? 3.5 : 2.2}
                    fill={dotColor}
                    opacity={isActive ? 1 : 0.85}
                  />
                  {isActive && pt && (
                    <g pointerEvents="none">
                      <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        rx="4"
                        fill="var(--color-card)"
                        stroke={dotColor}
                        strokeWidth="1"
                        opacity="0.97"
                      />
                      <text
                        x={textX}
                        y={boxY + 12}
                        fill="var(--color-muted-foreground)"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="700"
                      >
                        {pt.scoreAfter}
                      </text>
                      <text
                        x={textX}
                        y={boxY + 24}
                        fill={wonSelf ? 'var(--color-primary)' : 'var(--color-destructive)'}
                        fontSize="7"
                        fontFamily="sans-serif"
                      >
                        {detailText.length > 30 ? `${detailText.slice(0, 28)}…` : detailText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-1 flex items-center justify-between font-mono text-[12px] text-muted-foreground">
          <span className="text-accent-ink">&#9650; {selfName} winning</span>
          <span>Tap a dot for point detail</span>
          <span className="text-destructive">&#9660; {oppName} winning</span>
        </div>
      </CardContent>
    </Card>
  );
}
