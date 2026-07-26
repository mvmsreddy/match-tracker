// Aggregation layer over src/lib/analytics.js's single-session functions.
// Each compute* function there operates on one match's points[] array — this
// sums the raw counts across every tracked match in a segment and
// recomputes derived percentages/ratios from the summed counts, rather than
// averaging pre-computed per-match percentages (which would be mathematically
// wrong when match sample sizes differ). Matches with no points[] (untracked,
// official-score-only entries) are simply skipped — they contribute rank/
// points data elsewhere (aita_rankings) but no stroke-level analytics.
import { computeStrokeBreakdown, computeServeStats, computeReturnStats, computeRallyBreakdown, replayMatchAnalytics } from './analytics';

const STROKES = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash'];

export function aggregateStrokeBreakdown(matches) {
  const totals = new Map(STROKES.map(s => [s, { stroke: s, wfe: 0, ue: 0 }]));
  for (const m of matches) {
    if (!m.points?.length) continue;
    for (const row of computeStrokeBreakdown(m.points, 'self')) {
      const t = totals.get(row.stroke);
      t.wfe += row.wfe;
      t.ue += row.ue;
    }
  }
  return [...totals.values()];
}

export function aggregateServeStats(matches) {
  let totalServicePts = 0, aces = 0, dfs = 0, firstIn = 0, secondIn = 0, wonOn1st = 0, wonOn2nd = 0, gamesPlayed = 0;
  for (const m of matches) {
    if (!m.points?.length) continue;
    const s = computeServeStats(m.points, 'self');
    totalServicePts += s.totalServicePts; aces += s.aces; dfs += s.dfs;
    firstIn += s.firstIn; secondIn += s.secondIn;
    wonOn1st += s.wonOn1st; wonOn2nd += s.wonOn2nd;
    gamesPlayed += s.gamesPlayed;
  }
  const firstPct = totalServicePts > 0 ? (firstIn / totalServicePts * 100) : 0;
  const secondAttempts = secondIn + dfs;
  const secondPct = secondAttempts > 0 ? (secondIn / secondAttempts * 100) : 0;
  return {
    gamesPlayed, totalServicePts, aces, dfs,
    ratio: dfs > 0 ? (aces / dfs) : (aces > 0 ? Infinity : 0),
    firstPct, wonOn1st, firstIn, secondPct, wonOn2nd, secondIn,
  };
}

export function aggregateReturnStats(matches) {
  let gamesPlayed = 0, total1st = 0, won1st = 0, total2nd = 0, won2nd = 0, retWinnersForced = 0, retUE = 0;
  for (const m of matches) {
    if (!m.points?.length) continue;
    const r = computeReturnStats(m.points, 'self');
    gamesPlayed += r.gamesPlayed;
    total1st += r.total1st; won1st += r.won1st;
    total2nd += r.total2nd; won2nd += r.won2nd;
    retWinnersForced += r.retWinnersForced; retUE += r.retUE;
  }
  return {
    gamesPlayed, totalReturnPts: total1st + total2nd, won1st, total1st, won2nd, total2nd,
    retWinnersForced, retUE, ratio: retUE > 0 ? (retWinnersForced / retUE) : (retWinnersForced > 0 ? Infinity : 0),
  };
}

export function aggregateRallyBreakdown(matches) {
  const serverEnded = { green: new Array(7).fill(0), red: new Array(7).fill(0) };
  const receiverEnded = { green: new Array(7).fill(0), red: new Array(7).fill(0) };
  for (const m of matches) {
    if (!m.points?.length) continue;
    const r = computeRallyBreakdown(m.points, 'self');
    for (let i = 0; i < 7; i++) {
      serverEnded.green[i] += r.serverEnded.green[i];
      serverEnded.red[i] += r.serverEnded.red[i];
      receiverEnded.green[i] += r.receiverEnded.green[i];
      receiverEnded.red[i] += r.receiverEnded.red[i];
    }
  }
  return { cats: ['1', '2', '3', '4', '5', '6', '7+'], serverEnded, receiverEnded };
}

export function aggregateBreakPoints(matches) {
  let facedServing = 0, savedServing = 0, facedReturning = 0, wonReturning = 0;
  for (const m of matches) {
    if (!m.points?.length) continue;
    const { bp } = replayMatchAnalytics(m.points, { sessionType: m.sessionType, formatPreset: m.formatPreset });
    facedServing += bp.self.facedServing; savedServing += bp.self.savedServing;
    facedReturning += bp.self.facedReturning; wonReturning += bp.self.wonReturning;
  }
  return {
    facedServing, savedServing, facedReturning, wonReturning,
    saveRate: facedServing > 0 ? Math.round((savedServing / facedServing) * 100) : null,
    convertRate: facedReturning > 0 ? Math.round((wonReturning / facedReturning) * 100) : null,
  };
}

// Win rate per stroke (winners+forced / (winners+forced+unforced)) — the
// "Forehand Dominance: 78% win rate" style figure. Returns null for strokes
// with too few data points (< minSample) so the UI doesn't over-interpret noise.
export function strokeWinRates(strokeBreakdown, minSample = 5) {
  return strokeBreakdown.map(({ stroke, wfe, ue }) => {
    const total = wfe + ue;
    return { stroke, total, winRate: total >= minSample ? Math.round((wfe / total) * 100) : null };
  });
}
