import { computeStats, computeServeStats, computeReturnStats, replayMatchAnalytics } from './analytics';

export function fmtRatio(r) { return r === Infinity ? '∞' : r.toFixed(2); }
export function fmtPct(p) { return p.toFixed(1) + '%'; }

// Shared by MyMatchesTab (dashboard) and ComparePage's "My Matches" mode —
// used to be copy-pasted verbatim in both places.
export function buildComparisonRows(matches) {
  const perMatch = matches.map(m => {
    const cfgOpts = { sessionType: m.sessionType, formatPreset: m.formatPreset, pointTarget: m.pointTarget };
    const stats = computeStats(m.points);
    const serve = computeServeStats(m.points, 'self');
    const ret = computeReturnStats(m.points, 'self');
    const analytics = replayMatchAnalytics(m.points, cfgOpts);
    return { m, stats, serve, ret, analytics };
  });

  return [
    { label: 'Score', values: perMatch.map(x => x.m.scoreSummary || '—') },
    { label: 'Winner', values: perMatch.map(x => (x.m.winner === 'self' ? x.m.selfName : (x.m.winner === 'opp' ? x.m.oppName : 'In progress'))) },
    { label: 'Winners/Forced Errors', values: perMatch.map(x => x.stats.self.wfe) },
    { label: 'Unforced Errors', values: perMatch.map(x => x.stats.self.ue) },
    { label: 'W/FE : UE Ratio', values: perMatch.map(x => fmtRatio(x.stats.self.ratio)) },
    { label: 'Points Won', values: perMatch.map(x => x.stats.self.pointCount) },
    { label: 'Aces', values: perMatch.map(x => x.serve.aces) },
    { label: 'Double Faults', values: perMatch.map(x => x.serve.dfs) },
    { label: '1st Serve %', values: perMatch.map(x => fmtPct(x.serve.firstPct)) },
    { label: 'Break Points Saved', values: perMatch.map(x => `${x.analytics.bp.self.savedServing}/${x.analytics.bp.self.facedServing}`) },
    { label: 'Break Points Won', values: perMatch.map(x => `${x.analytics.bp.self.wonReturning}/${x.analytics.bp.self.facedReturning}`) },
    { label: 'Return Winners/Forced', values: perMatch.map(x => x.ret.retWinnersForced) },
  ];
}
