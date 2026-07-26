import { useMemo } from 'react';
import { computeServeStats, computeStrokeBreakdown, computeRallyBreakdown, computeBreakPointEvents } from '../../lib/analytics';
import { strokeWinRates } from '../../lib/segmentAnalytics';

const RALLY_COLORS = ['var(--accent)', 'var(--accent)', 'var(--info)', 'var(--text3)', 'var(--text3)', 'var(--text3)', 'var(--text3)'];

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
      { label: '1st serve in', value: `${Math.round(serve.firstPct)}%`, color: 'var(--text)' },
      { label: 'Aces / DF', value: `${serve.aces} / ${serve.dfs}`, color: 'var(--accent)' },
      { label: 'Winners', value: String(winners), color: 'var(--accent)' },
      { label: 'Unforced', value: String(unforced), color: 'var(--opp)' },
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
      color: RALLY_COLORS[i] || 'var(--text3)',
    })).filter((_, i) => totals[i] > 0 || i < 4);
  }, [tm, points]);

  const wings = useMemo(() => {
    if (!tm) return null;
    const rates = strokeWinRates(computeStrokeBreakdown(points, 'self'), 3);
    return rates
      .filter(r => ['Forehand', 'Backhand', 'Serve'].includes(r.stroke) && r.winRate !== null)
      .map(r => ({ name: r.stroke, value: `${r.winRate}%`, w: `${r.winRate}%`, color: r.winRate >= 55 ? 'var(--accent)' : 'var(--info)' }));
  }, [tm, points]);

  const breaks = useMemo(() => {
    if (!tm) return null;
    return computeBreakPointEvents(points, cfgOpts, 'self');
  }, [tm, points, cfgOpts.sessionType, cfgOpts.formatPreset]);

  const metaParts = [match.tournamentName, match.round, match.grade].filter(Boolean);

  return (
    <div className="pcd-modal-overlay" onClick={onClose}>
      <div className="pcd-modal" onClick={e => e.stopPropagation()}>
        <div className="pcd-modal-head">
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="pcd-modal-result" style={{ color: match.won ? 'var(--accent)' : 'var(--opp)' }}>
              {match.won ? 'WON' : 'LOST'}
            </div>
            <div className="pcd-modal-headline">
              {match.won ? `${selfName} d. ${match.opponentName}` : `${match.opponentName} d. ${selfName}`}
            </div>
            <div className="pcd-modal-meta">{metaParts.join(' · ')}{match.date ? ` · ${formatDate(match.date)}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
            <div className="pcd-modal-score" style={{ color: match.won ? 'var(--accent)' : 'var(--opp)' }}>{match.score || '—'}</div>
            <button className="pcd-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {tm ? (
          <div className="pcd-modal-body">
            <div>
              <div className="pcd-modal-section-label">Serve and error profile</div>
              <div className="pcd-kpi-grid">
                {kpis.map(k => (
                  <div key={k.label} className="pcd-kpi-tile">
                    <div className="pcd-kpi-label">{k.label}</div>
                    <div className="pcd-kpi-value" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="pcd-modal-section-label">Rally length distribution</div>
              <div className="pcd-rally-bars">
                {rally.map((b, i) => (
                  <div key={i} className="pcd-rally-bar-col">
                    <div className="pcd-rally-pct" style={{ color: b.color }}>{b.pct}</div>
                    <div className="pcd-rally-fill" style={{ height: b.h, background: b.color }} />
                  </div>
                ))}
              </div>
              <div className="pcd-rally-labels">
                {rally.map((b, i) => <div key={i} className="pcd-rally-label">{b.label}</div>)}
              </div>
            </div>

            {wings.length > 0 && (
              <div>
                <div className="pcd-modal-section-label">Wing &amp; serve win rates</div>
                {wings.map(w => (
                  <div key={w.name} className="pcd-wing-row">
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ font: "600 13px/1 'Archivo', sans-serif" }}>{w.name}</div>
                      <div style={{ font: "600 13px/1 'IBM Plex Mono', monospace", color: w.color }}>{w.value}</div>
                    </div>
                    <div className="pcd-bar-track"><div className="pcd-bar-fill" style={{ width: w.w, background: w.color }} /></div>
                  </div>
                ))}
              </div>
            )}

            {breaks.length > 0 && (
              <div>
                <div className="pcd-modal-section-label">Break points</div>
                <div>
                  {breaks.map((b, i) => (
                    <div key={i} className="pcd-bp-row">
                      <div className="pcd-bp-dot" style={{ background: b.outcome === 'missed' ? 'var(--opp)' : 'var(--accent)' }} />
                      <div className="pcd-bp-text">{b.text}</div>
                      <div className="pcd-bp-at">{b.at}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pcd-modal-empty">
            <div className="pcd-modal-empty-title">Official score only</div>
            <div className="pcd-modal-empty-body">
              No tracker data was recorded for this match. Launch the tracker from a scheduled match to link point-by-point data automatically.
            </div>
          </div>
        )}

        <div className="pcd-modal-footer">
          <button className="pcd-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
