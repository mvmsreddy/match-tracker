import { ZONES, SHORT_LABEL, center } from '../lib/courtZones';
import { computeShotLocationBreakdown } from '../lib/analytics';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Table, TableBody, TableRow, TableHead, TableCell } from './ui/table';

const ORDER = ['win', 'forced', 'ue'];
const COLOR_VAR = { win: 'var(--color-tt-win)', forced: 'var(--color-tt-forced)', ue: 'var(--color-tt-destructive)' };
const LABEL = { win: 'Winner', forced: 'Forced Error', ue: 'Unforced Error' };
const BAND_GAP = 1.5;

function zoneBands(zone, counts) {
  const total = counts.win + counts.forced + counts.ue;
  if (total === 0) return [];
  const active = ORDER.filter((k) => counts[k] > 0);
  const usableH = zone.h - BAND_GAP * (active.length - 1);
  let cursorY = zone.y;
  return active.map((k) => {
    const h = (usableH * counts[k]) / total;
    const band = { key: k, x: zone.x, y: cursorY, w: zone.w, h, color: COLOR_VAR[k] };
    cursorY += h + BAND_GAP;
    return band;
  });
}

function zoneTooltip(zoneId, counts) {
  const parts = ORDER.filter((k) => counts[k] > 0).map((k) => counts[k] + ' ' + LABEL[k] + (counts[k] === 1 ? '' : 's'));
  return zoneId + ' — ' + (parts.length ? parts.join(', ') : 'no shots');
}

function ZoneCourt({ breakdown, label }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="font-tt-mono text-[10px] uppercase tracking-wider text-tt-muted-foreground">{label}</div>
      <div className="court-svg-wrap w-full max-w-[150px]">
        <svg viewBox="0 0 300 640" role="img" aria-label={label + ' shot location heatmap'}>
          {ZONES.map((z) => {
            const counts = breakdown[z.id] || { win: 0, forced: 0, ue: 0 };
            const bands = zoneBands(z, counts);
            const { cx, cy } = center(z);
            return (
              <g key={z.id}>
                <rect className={'zone-cell' + (z.out ? ' out' : '')} x={z.x} y={z.y} width={z.w} height={z.h} />
                {bands.map((b) => (
                  <rect key={b.key} className="zone-band" x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} />
                ))}
                <text className="court-zone-label" x={cx} y={cy}>{SHORT_LABEL[z.id]}</text>
                <title>{zoneTooltip(z.id, counts)}</title>
              </g>
            );
          })}
          <rect className="court-line-main" x="50" y="20" width="200" height="600" />
          <line className="court-line-main" x1="50" y1="320" x2="250" y2="320" />
          <line className="court-line-main" x1="50" y1="149" x2="250" y2="149" />
          <line className="court-line-main" x1="50" y1="451" x2="250" y2="451" />
          <line className="court-line-main" x1="150" y1="149" x2="150" y2="451" />
          <line className="court-line-main" x1="145" y1="20" x2="155" y2="20" />
          <line className="court-line-main" x1="145" y1="620" x2="155" y2="620" />
        </svg>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-2 flex flex-wrap gap-3">
      {ORDER.map((k) => (
        <span className="flex items-center gap-1.5 font-tt-mono text-[10px] uppercase tracking-wider text-tt-muted-foreground" key={k}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_VAR[k] }} />
          {LABEL[k]}
        </span>
      ))}
    </div>
  );
}

function ZoneTable({ selfBreakdown, oppBreakdown, selfName, oppName }) {
  const zoneIds = ZONES
    .map((z) => z.id)
    .filter((id) => {
      const s = selfBreakdown[id], o = oppBreakdown[id];
      return (s && (s.win + s.forced + s.ue) > 0) || (o && (o.win + o.forced + o.ue) > 0);
    })
    .sort((a, b) => {
      const total = (id) => {
        const s = selfBreakdown[id] || { win: 0, forced: 0, ue: 0 };
        const o = oppBreakdown[id] || { win: 0, forced: 0, ue: 0 };
        return s.win + s.forced + s.ue + o.win + o.forced + o.ue;
      };
      return total(b) - total(a);
    });

  if (zoneIds.length === 0) return null;

  const fmt = (c) => (c ? c.win + '/' + c.forced + '/' + c.ue : '0/0/0');

  return (
    <div className="mt-3">
      <Table>
        <TableBody>
          <TableRow>
            <TableHead>Zone</TableHead>
            <TableHead className="text-tt-brand">{selfName} (W/F/UE)</TableHead>
            <TableHead className="text-tt-opp">{oppName} (W/F/UE)</TableHead>
          </TableRow>
          {zoneIds.map((id) => (
            <TableRow key={id}>
              <TableCell>{id}</TableCell>
              <TableCell className="text-tt-brand">{fmt(selfBreakdown[id])}</TableCell>
              <TableCell className="text-tt-opp">{fmt(oppBreakdown[id])}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ShotLocationHeatmap({ points, selfName, oppName }) {
  const hasData = points.some((pt) => pt.hitFrom && pt.droppedAt);
  if (!hasData) return null;

  const selfBd = computeShotLocationBreakdown(points, 'self');
  const oppBd = computeShotLocationBreakdown(points, 'opp');

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Shot Origin · Hit From</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Legend />
          <div className="flex gap-4">
            <ZoneCourt breakdown={selfBd.hitFrom} label={selfName} />
            <ZoneCourt breakdown={oppBd.hitFrom} label={oppName} />
          </div>
          <ZoneTable selfBreakdown={selfBd.hitFrom} oppBreakdown={oppBd.hitFrom} selfName={selfName} oppName={oppName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Shot Placement · Dropped At</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Legend />
          <div className="flex gap-4">
            <ZoneCourt breakdown={selfBd.droppedAt} label={selfName} />
            <ZoneCourt breakdown={oppBd.droppedAt} label={oppName} />
          </div>
          <ZoneTable selfBreakdown={selfBd.droppedAt} oppBreakdown={oppBd.droppedAt} selfName={selfName} oppName={oppName} />
        </CardContent>
      </Card>
    </>
  );
}
