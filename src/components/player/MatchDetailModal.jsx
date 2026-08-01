import { useMemo } from 'react';
import { computeServeStats, computeStrokeBreakdown, computeRallyBreakdown, computeBreakPointEvents } from '../../lib/analytics';
import { strokeWinRates } from '../../lib/segmentAnalytics';
import { Button } from '@/components/primitives/button';

const RALLY_COLORS = ['bg-primary', 'bg-primary', 'bg-blue-400', 'bg-muted-foreground', 'bg-muted-foreground', 'bg-muted-foreground', 'bg-muted-foreground'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Match detail modal — opens from a recent-result / tournament-match row on the
// Player Coaching Dashboard. `match` is a normalized row (see
// useSegmentMatchSchedule.js and TournamentsTab.jsx's own per-match resolution):
// { opponentName, tournamentName, round, date, score, won, tracked, trackedMatch }.
// When `tracked`/`trackedMatch` is present, every stat below is computed live from
// that match's real points[] via src/lib/analytics.js — nothing here is fabricated.
export default function MatchDetailModal({ match, selfName = 'You', onClose }) {
  const tm = match.trackedMatch;
  const points = tm?.points || [];
  const cfgOpts = { sessionType: tm?.sessionType, formatPreset: tm?.formatPreset };

  const kpis = useMemo(() => {
    if (!tm) return null;
    const serve = computeServeStats(points, 'self');
    const winners = points.filter(pt => pt.endedBy === 'self' && pt.reason === 'Winner').length;
    const unforced = points.filter(pt => pt.endedBy === 'self' && pt.reason === 'UnforcedError').length;
    return [
      { label: '1st serve in', value: `${Math.round(serve.firstPct)}%`, cls: 'text-foreground' },
      { label: 'Aces / DF', value: `${serve.aces} / ${serve.dfs}`, cls: 'text-accent-ink' },
      { label: 'Winners', value: String(winners), cls: 'text-accent-ink' },
      { label: 'Unforced', value: String(unforced), cls: 'text-destructive' },
    ];
  }, [tm, points]);

  const rally = useMemo(() => {
    if (!tm) return null;
    const own = computeRallyBreakdown(points, 'self');
    const opp = computeRallyBreakdown(points, 'opp');
    const totals = own.cats.map((_, i) =>
      own.serverEnded.green[i] + own.serverEnded.red[i] + own.receiverEnded.green[i] + own.receiverEnded.red[i] +
      opp.serverEnded.green[i] + opp.serverEnded.red[i] + opp.receiverEnded.green[i] + opp.receiverEnded.red[i]
    );
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    const max = Math.max(...totals, 1);
    return own.cats.map((label, i) => ({
      label: label === '7+' ? '7+' : `${label} shot${label === '1' ? '' : 's'}`,
      pct: `${Math.round((totals[i] / sum) * 100)}%`,
      h: `${Math.max(4, Math.round((totals[i] / max) * 100))}%`,
      colorCls: RALLY_COLORS[i] || 'bg-muted-foreground',
    })).filter((_, i) => totals[i] > 0 || i < 4);
  }, [tm, points]);

  const wings = useMemo(() => {
    if (!tm) return null;
    const rates = strokeWinRates(computeStrokeBreakdown(points, 'self'), 3);
    return rates
      .filter(r => ['Forehand', 'Backhand', 'Serve'].includes(r.stroke) && r.winRate !== null)
      .map(r => ({ name: r.stroke, value: `${r.winRate}%`, w: `${r.winRate}%`, positive: r.winRate >= 55 }));
  }, [tm, points]);

  const breaks = useMemo(() => {
    if (!tm) return null;
    return computeBreakPointEvents(points, cfgOpts, 'self');
  }, [tm, points, cfgOpts.sessionType, cfgOpts.formatPreset]);

  const metaParts = [match.tournamentName, match.round, match.grade].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-48">
            <div className={`text-xs font-bold uppercase tracking-wider ${match.won ? 'text-accent-ink' : 'text-destructive'}`}>
              {match.won ? 'Won' : 'Lost'}
            </div>
            <div className="font-display font-extrabold text-lg tracking-tighter mt-1">
              {match.won ? `${selfName} d. ${match.opponentName}` : `${match.opponentName} d. ${selfName}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{metaParts.join(' · ')}{match.date ? ` · ${formatDate(match.date)}` : ''}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className={`font-display font-extrabold text-base ${match.won ? 'text-accent-ink' : 'text-destructive'}`}>{match.score || '—'}</div>
            <button className="w-7 h-7 rounded-sm hover:bg-secondary flex items-center justify-center" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {tm ? (
          <div className="space-y-5 mt-5">
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Serve and error profile</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {kpis.map(k => (
                  <div key={k.label} className="rounded-sm border border-border bg-secondary/50 p-2.5">
                    <div className="text-[12px] text-muted-foreground">{k.label}</div>
                    <div className={`font-display font-extrabold text-base ${k.cls}`}>{k.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Rally length distribution</div>
              <div className="flex items-end gap-2 h-20">
                {rally.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <div className="text-[12px] font-bold">{b.pct}</div>
                    <div className={`w-full rounded-sm ${b.colorCls}`} style={{ height: b.h }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                {rally.map((b, i) => <div key={i} className="flex-1 text-[9px] text-muted-foreground text-center">{b.label}</div>)}
              </div>
            </div>

            {wings.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Wing &amp; serve win rates</div>
                <div className="space-y-2">
                  {wings.map(w => (
                    <div key={w.name}>
                      <div className="flex items-baseline justify-between mb-1">
                        <div className="text-sm font-semibold">{w.name}</div>
                        <div className={`text-sm font-bold ${w.positive ? 'text-accent-ink' : 'text-blue-400'}`}>{w.value}</div>
                      </div>
                      <div className="h-2 rounded-sm bg-muted">
                        <div className={`h-full rounded-sm ${w.positive ? 'bg-primary' : 'bg-blue-400'}`} style={{ width: w.w }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {breaks.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Break points</div>
                <div className="space-y-1.5">
                  {breaks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.outcome === 'missed' ? 'bg-destructive' : 'bg-primary'}`} />
                      <span className="flex-1">{b.text}</span>
                      <span className="text-muted-foreground">{b.at}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 border border-dashed border-border rounded-sm p-6 text-center">
            <div className="font-bold text-sm">Official score only</div>
            <div className="text-xs text-muted-foreground mt-1">
              No tracker data was recorded for this match. Launch the tracker from a scheduled match to link point-by-point data automatically.
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
