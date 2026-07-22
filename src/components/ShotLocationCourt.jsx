import { useState } from 'react';
import { ZONES, SHORT_LABEL, center } from '../lib/courtZones';

/** Two-tap court diagram: first tap sets Hit From, second tap commits Dropped At. */
export default function ShotLocationCourt({ onComplete }) {
  const [hitFrom, setHitFrom] = useState(null);
  const hitZone = hitFrom ? ZONES.find((z) => z.id === hitFrom) : null;

  function handleZoneClick(id) {
    if (!hitFrom) {
      setHitFrom(id);
    } else {
      onComplete(hitFrom, id);
    }
  }

  return (
    <div className="shot-location-court">
      <div className="shot-location-hint">
        {hitFrom ? 'Tap 2 — Where did it drop?' : 'Tap 1 — Where was it hit from?'}
      </div>
      <div className="court-svg-wrap">
        <svg viewBox="0 0 300 640" role="img" aria-label="Court zone picker">
          {ZONES.map((z) => (
            <rect
              key={z.id}
              className={'court-zone' + (z.out ? ' out' : '')}
              x={z.x} y={z.y} width={z.w} height={z.h}
              onClick={() => handleZoneClick(z.id)}
            />
          ))}

          {ZONES.filter((z) => !z.out).map((z) => {
            const { cx, cy } = center(z);
            return (
              <text key={z.id + '-label'} className="court-zone-label" x={cx} y={cy}>
                {SHORT_LABEL[z.id]}
              </text>
            );
          })}

          <rect className="court-line-main" x="50" y="20" width="200" height="600" />
          <line className="court-line-main" x1="50" y1="320" x2="250" y2="320" />
          <line className="court-line-main" x1="50" y1="149" x2="250" y2="149" />
          <line className="court-line-main" x1="50" y1="451" x2="250" y2="451" />
          <line className="court-line-main" x1="150" y1="149" x2="150" y2="451" />
          <line className="court-line-main" x1="145" y1="20" x2="155" y2="20" />
          <line className="court-line-main" x1="145" y1="620" x2="155" y2="620" />

          {hitZone && (() => {
            const { cx, cy } = center(hitZone);
            return (
              <g className="court-marker-crosshair">
                <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} />
                <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} />
                <circle cx={cx} cy={cy} r="10" />
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
