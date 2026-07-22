// Named tactical zones rather than free-form coordinates, so a tap stays fast and
// forgiving during live tracking. "Far"/"Near" halves let the same court serve both
// the shot's origin (Hit From) and its landing spot (Dropped At) in one diagram.
export const ZONES = [
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

export const SHORT_LABEL = {
  'Wide Left': 'Wide', 'Wide Right': 'Wide',
  'Long (Far)': 'Long', 'Long (Near)': 'Long',
  'Far Deep Left': 'Deep L', 'Far Deep Center': 'Deep C', 'Far Deep Right': 'Deep R',
  'Far Mid-Court': 'Mid-Court', 'Far Ad Box': 'Ad Box', 'Far Deuce Box': 'Deuce Box',
  'Near Deuce Box': 'Deuce Box', 'Near Ad Box': 'Ad Box', 'Near Mid-Court': 'Mid-Court',
  'Near Deep Left': 'Deep L', 'Near Deep Center': 'Deep C', 'Near Deep Right': 'Deep R',
};

export function center(zone) {
  return { cx: zone.x + zone.w / 2, cy: zone.y + zone.h / 2 };
}

export const COURT_VIEWBOX = { w: 300, h: 640 };
