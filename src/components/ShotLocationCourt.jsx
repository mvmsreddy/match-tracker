import { useState } from 'react';

// Named tactical zones rather than free-form coordinates, so a tap stays fast and
// forgiving during live tracking. "Far"/"Near" halves let the same court serve both
// the shot's origin (Hit From) and its landing spot (Dropped At) in one diagram.
const ZONES = [
  { id: 'Wide Left', out: true, x: 0, y: 0, w: 50, h: 640 },
  { id: 'Wide Right', out: true, x: 250, y: 0, w: 50, h: 640 },
  { id: 'Long (Far)', out: true, x: 50, y: 0, w: 200, h: 20 },
  { id: 'Long (Near)', out: true, x: 50, y: 620, w: 200, h: 20 },

  { id: 'Far Deep Left', x: 50, y: 20, w: 66.7, h: 86 },
  { id: 'Far Deep Center', x: 116.7, y: 20, w: 66.6, h: 86 },
  { id: 'Far Deep Right', x: 183.3, y: 20, w: 66.7, h: 86 },
  { id: 'Far Mid-Court', x: 50, y: 106, w: 200, h: 43 },
  { id: 'Far Ad Box', x: 50, y: 149, w: 100, h: 151 },
  { id: 'Far Deuce Box', x: 150, y: 149, w: 100, h: 151 },

  { id: 'Near Deuce Box', x: 50, y: 300, w: 100, h: 151 },
  { id: 'Near Ad Box', x: 150, y: 300, w: 100, h: 151 },
  { id: 'Near Mid-Court', x: 50, y: 451, w: 200, h: 43 },
  { id: 'Near Deep Left', x: 50, y: 494, w: 66.7, h: 86 },
  { id: 'Near Deep Center', x: 116.7, y: 494, w: 66.6, h: 86 },
  { id: 'Near Deep Right', x: 183.3, y: 494, w: 66.7, h: 86 },
];

const SHORT_LABEL = {
  'Wide Left': 'Wide', 'Wide Right': 'Wide',
  'Long (Far)': 'Long', 'Long (Near)': 'Long',
  'Far Deep Left': 'Deep L', 'Far Deep Center': 'Deep C', 'Far Deep Right': 'Deep R',
  'Far Mid-Court': 'Mid-Court', 'Far Ad Box': 'Ad Box', 'Far Deuce Box': 'Deuce Box',
  'Near Deuce Box': 'Deuce Box', 'Near Ad Box': 'Ad Box', 'Near Mid-Court': 'Mid-Court',
  'Near Deep Left': 'Deep L', 'Near Deep Center': 'Deep C', 'Near Deep Right': 'Deep R',
};

function center(zone) {
  return { cx: zone.x + zone.w / 2, cy: zone.y + zone.h / 2 };
}

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
