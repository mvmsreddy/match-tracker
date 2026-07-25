import {
  computeStats, computeGroundstrokes, computeServeStats, computeReturnStats,
} from '../lib/analytics';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Table, TableBody, TableRow, TableHead, TableCell } from './ui/table';

function fmtRatio(r) { return r === Infinity ? '∞' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

export default function StatsPanel({ points, header, sessionType, analytics, section }) {
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';
  const isMatch = sessionType !== 'practice';

  const totals = computeStats(points);
  const gsSelf = computeGroundstrokes(points, 'self');
  const maxVal = Math.max(1, ...gsSelf.map((r) => Math.max(r.wfe, r.ue)));

  const ss = computeServeStats(points, 'self');
  const so = computeServeStats(points, 'opp');
  const rs = computeReturnStats(points, 'self');
  const ro = computeReturnStats(points, 'opp');

  if (section === 'shots') {
    return (
      <Card>
        <CardHeader><CardTitle>Shot Stats · Self</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {gsSelf.map((r) => (
            <div key={r.stroke}>
              <div className="mb-1 font-tt-mono text-xs text-tt-muted-foreground">{r.stroke}</div>
              <div className="h-4 rounded-tt bg-tt-surface-2">
                <div
                  className="flex h-full items-center rounded-tt bg-tt-brand px-1.5 font-tt-mono text-[10px] font-semibold text-tt-background"
                  style={{ width: Math.max(6, r.wfe / maxVal * 100) + '%' }}
                >
                  {r.wfe} W/FE
                </div>
              </div>
              <div className="mt-0.5 h-4 rounded-tt bg-tt-surface-2">
                <div
                  className="flex h-full items-center rounded-tt bg-tt-destructive px-1.5 font-tt-mono text-[10px] font-semibold text-tt-foreground"
                  style={{ width: Math.max(6, r.ue / maxVal * 100) + '%' }}
                >
                  {r.ue} UE
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Match Totals</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableBody>
              <TableRow><TableHead>Metric</TableHead><TableHead className="text-tt-brand">{selfName}</TableHead><TableHead className="text-tt-opp">{oppName}</TableHead></TableRow>
              <TableRow><TableCell>Winners/Forced Errors</TableCell><TableCell className="text-tt-brand">{totals.self.wfe}</TableCell><TableCell className="text-tt-opp">{totals.opp.wfe}</TableCell></TableRow>
              <TableRow><TableCell>Unforced Errors</TableCell><TableCell className="text-tt-brand">{totals.self.ue}</TableCell><TableCell className="text-tt-opp">{totals.opp.ue}</TableCell></TableRow>
              <TableRow><TableCell>Ratio</TableCell><TableCell className="text-tt-brand">{fmtRatio(totals.self.ratio)}</TableCell><TableCell className="text-tt-opp">{fmtRatio(totals.opp.ratio)}</TableCell></TableRow>
              <TableRow><TableCell>Points Won</TableCell><TableCell className="text-tt-brand">{totals.self.pointCount}</TableCell><TableCell className="text-tt-opp">{totals.opp.pointCount}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Serving Statistics</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableBody>
              <TableRow><TableHead>Metric</TableHead><TableHead className="text-tt-brand">{selfName}</TableHead><TableHead className="text-tt-opp">{oppName}</TableHead></TableRow>
              {isMatch ? (
                <TableRow><TableCell>Service Games</TableCell><TableCell className="text-tt-brand">{ss.gamesPlayed}</TableCell><TableCell className="text-tt-opp">{so.gamesPlayed}</TableCell></TableRow>
              ) : (
                <TableRow><TableCell>Service Points</TableCell><TableCell className="text-tt-brand">{ss.totalServicePts}</TableCell><TableCell className="text-tt-opp">{so.totalServicePts}</TableCell></TableRow>
              )}
              {isMatch && (
                <>
                  <TableRow><TableCell>Service Games Won</TableCell><TableCell className="text-tt-brand">{fmtPct(ss.gamesPlayed > 0 ? analytics.svcGamesWon.self / ss.gamesPlayed * 100 : 0)}</TableCell><TableCell className="text-tt-opp">{fmtPct(so.gamesPlayed > 0 ? analytics.svcGamesWon.opp / so.gamesPlayed * 100 : 0)}</TableCell></TableRow>
                  <TableRow><TableCell>Break Points Saved</TableCell><TableCell className="text-tt-brand">{analytics.bp.self.savedServing}/{analytics.bp.self.facedServing}</TableCell><TableCell className="text-tt-opp">{analytics.bp.opp.savedServing}/{analytics.bp.opp.facedServing}</TableCell></TableRow>
                </>
              )}
              <TableRow><TableCell>Aces</TableCell><TableCell className="text-tt-brand">{ss.aces}</TableCell><TableCell className="text-tt-opp">{so.aces}</TableCell></TableRow>
              <TableRow><TableCell>Double Faults</TableCell><TableCell className="text-tt-brand">{ss.dfs}</TableCell><TableCell className="text-tt-opp">{so.dfs}</TableCell></TableRow>
              <TableRow><TableCell>1st Serve %</TableCell><TableCell className="text-tt-brand">{fmtPct(ss.firstPct)}</TableCell><TableCell className="text-tt-opp">{fmtPct(so.firstPct)}</TableCell></TableRow>
              <TableRow><TableCell>Won on 1st Serve</TableCell><TableCell className="text-tt-brand">{ss.wonOn1st}/{ss.firstIn}</TableCell><TableCell className="text-tt-opp">{so.wonOn1st}/{so.firstIn}</TableCell></TableRow>
              <TableRow><TableCell>2nd Serve %</TableCell><TableCell className="text-tt-brand">{fmtPct(ss.secondPct)}</TableCell><TableCell className="text-tt-opp">{fmtPct(so.secondPct)}</TableCell></TableRow>
              <TableRow><TableCell>Won on 2nd Serve</TableCell><TableCell className="text-tt-brand">{ss.wonOn2nd}/{ss.secondIn}</TableCell><TableCell className="text-tt-opp">{so.wonOn2nd}/{so.secondIn}</TableCell></TableRow>
              <TableRow><TableCell>Ace/DF Ratio</TableCell><TableCell className="text-tt-brand">{fmtRatio(ss.ratio)}</TableCell><TableCell className="text-tt-opp">{fmtRatio(so.ratio)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Return Statistics</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableBody>
              <TableRow><TableHead>Metric</TableHead><TableHead className="text-tt-brand">{selfName}</TableHead><TableHead className="text-tt-opp">{oppName}</TableHead></TableRow>
              {isMatch ? (
                <TableRow><TableCell>Return Games</TableCell><TableCell className="text-tt-brand">{rs.gamesPlayed}</TableCell><TableCell className="text-tt-opp">{ro.gamesPlayed}</TableCell></TableRow>
              ) : (
                <TableRow><TableCell>Return Points</TableCell><TableCell className="text-tt-brand">{rs.totalReturnPts}</TableCell><TableCell className="text-tt-opp">{ro.totalReturnPts}</TableCell></TableRow>
              )}
              {isMatch && (
                <>
                  <TableRow><TableCell>Return Games Won</TableCell><TableCell className="text-tt-brand">{fmtPct(rs.gamesPlayed > 0 ? (rs.gamesPlayed - analytics.svcGamesWon.opp) / rs.gamesPlayed * 100 : 0)}</TableCell><TableCell className="text-tt-opp">{fmtPct(ro.gamesPlayed > 0 ? (ro.gamesPlayed - analytics.svcGamesWon.self) / ro.gamesPlayed * 100 : 0)}</TableCell></TableRow>
                  <TableRow><TableCell>Break Points Won</TableCell><TableCell className="text-tt-brand">{analytics.bp.self.wonReturning}/{analytics.bp.self.facedReturning}</TableCell><TableCell className="text-tt-opp">{analytics.bp.opp.wonReturning}/{analytics.bp.opp.facedReturning}</TableCell></TableRow>
                </>
              )}
              <TableRow><TableCell>Won Returning 1st</TableCell><TableCell className="text-tt-brand">{rs.won1st}/{rs.total1st}</TableCell><TableCell className="text-tt-opp">{ro.won1st}/{ro.total1st}</TableCell></TableRow>
              <TableRow><TableCell>Won Returning 2nd</TableCell><TableCell className="text-tt-brand">{rs.won2nd}/{rs.total2nd}</TableCell><TableCell className="text-tt-opp">{ro.won2nd}/{ro.total2nd}</TableCell></TableRow>
              <TableRow><TableCell>Return Winners/Forced</TableCell><TableCell className="text-tt-brand">{rs.retWinnersForced}</TableCell><TableCell className="text-tt-opp">{ro.retWinnersForced}</TableCell></TableRow>
              <TableRow><TableCell>Return Unforced Errors</TableCell><TableCell className="text-tt-brand">{rs.retUE}</TableCell><TableCell className="text-tt-opp">{ro.retUE}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
