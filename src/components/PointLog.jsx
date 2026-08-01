import { reasonLabel } from '../lib/format';
import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';

export default function PointLog({ points, header }) {
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';

  return (
    <Card>
      <CardHeader><CardTitle>Point-by-Point Log</CardTitle></CardHeader>
      <CardContent className="max-h-[280px] overflow-y-auto pt-0">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Score</th>
              <th className="px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Detail</th>
              <th className="px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Rally</th>
            </tr>
          </thead>
          <tbody>
            {points.slice().reverse().map((pt, i) => (
              <tr key={points.length - 1 - i} className="border-b border-border last:border-0">
                <td className="px-3 py-2 tabular-nums">{String(pt.scoreAfter)}</td>
                <td className={'px-3 py-2 ' + (pt.endedBy === 'self' ? 'text-accent-ink' : 'text-destructive')}>
                  {reasonLabel(pt, selfName, oppName)}
                </td>
                <td className="px-3 py-2 tabular-nums">{pt.rally}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
