import { getFormatConfig, strokeSide, SHOT_CATEGORIES } from './constants';
import { other } from './engine';

export function computeStats(points) {
  const s = {};
  ['self', 'opp'].forEach((p) => {
    const winners = points.filter((pt) => pt.endedBy === p && pt.reason === 'Winner').length;
    const forcedByThem = points.filter((pt) => pt.endedBy === other(p) && pt.reason === 'ForcedError').length;
    const wfe = winners + forcedByThem;
    const ue = points.filter((pt) => pt.endedBy === p && pt.reason === 'UnforcedError').length;
    const pointsWon = points.filter((pt) => pt.pointWinner === p).length;
    s[p] = { wfe, ue, ratio: ue > 0 ? (wfe / ue) : (wfe > 0 ? Infinity : 0), pointCount: pointsWon };
  });
  return s;
}

export function computeGroundstrokes(points, player) {
  return SHOT_CATEGORIES.map((st) => {
    const winners = points.filter((pt) => pt.endedBy === player && pt.reason === 'Winner' && pt.stroke === st && !pt.isReturn).length;
    const forced = points.filter((pt) => pt.endedBy === other(player) && pt.reason === 'ForcedError' && pt.stroke === st && !pt.isReturn).length;
    const ue = points.filter((pt) => pt.endedBy === player && pt.reason === 'UnforcedError' && pt.stroke === st && !pt.isReturn).length;
    return { stroke: st, wfe: winners + forced, ue };
  });
}

export function computeStrokeBreakdown(points, player) {
  const strokes = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash'];
  const matches = (pt, st) => {
    if (st === 'Serve') return pt.stroke === 'Serve';
    if (st === 'Volley') return pt.stroke && pt.stroke.startsWith('Volley');
    if (st === 'Smash') return pt.stroke && pt.stroke.startsWith('Smash');
    return strokeSide(pt.stroke) === st && !(pt.stroke && (pt.stroke.startsWith('Volley') || pt.stroke.startsWith('Smash')));
  };
  return strokes.map((st) => {
    const winners = points.filter((pt) => pt.endedBy === player && pt.reason === 'Winner' && matches(pt, st)).length;
    const forced = points.filter((pt) => pt.endedBy === other(player) && pt.reason === 'ForcedError' && matches(pt, st)).length;
    const ue = points.filter((pt) => pt.endedBy === player && pt.reason === 'UnforcedError' && matches(pt, st)).length;
    return { stroke: st, wfe: winners + forced, ue };
  });
}

export function computeServeStats(points, player) {
  const gamesSet = new Set();
  points.filter((pt) => pt.server === player).forEach((pt) => gamesSet.add(pt.set + '-' + pt.game));
  const servicePoints = points.filter((pt) => pt.server === player);
  const aces = servicePoints.filter((pt) => pt.reason === 'Winner' && pt.endedBy === player && pt.stroke === 'Serve').length;
  const dfs = servicePoints.filter((pt) => pt.reason === 'DoubleFault').length;
  const firstIn = servicePoints.filter((pt) => pt.serveResult === '1st').length;
  const secondIn = servicePoints.filter((pt) => pt.serveResult === '2nd').length;
  const totalServicePts = servicePoints.length;
  const firstPct = totalServicePts > 0 ? (firstIn / totalServicePts * 100) : 0;
  const secondAttempts = secondIn + dfs;
  const secondPct = secondAttempts > 0 ? (secondIn / secondAttempts * 100) : 0;
  const wonOn1st = servicePoints.filter((pt) => pt.serveResult === '1st' && pt.pointWinner === player).length;
  const wonOn2nd = servicePoints.filter((pt) => pt.serveResult === '2nd' && pt.pointWinner === player).length;
  return {
    gamesPlayed: gamesSet.size, totalServicePts, aces, dfs, ratio: dfs > 0 ? (aces / dfs) : (aces > 0 ? Infinity : 0),
    firstPct, wonOn1st, firstIn, secondPct, wonOn2nd, secondIn,
  };
}

export function computeReturnStats(points, player) {
  const server = other(player);
  const gamesSet = new Set();
  points.filter((pt) => pt.server === server).forEach((pt) => gamesSet.add(pt.set + '-' + pt.game));
  const returnPts1st = points.filter((pt) => pt.server === server && pt.serveResult === '1st');
  const returnPts2nd = points.filter((pt) => pt.server === server && pt.serveResult === '2nd');
  const won1st = returnPts1st.filter((pt) => pt.pointWinner === player).length;
  const won2nd = returnPts2nd.filter((pt) => pt.pointWinner === player).length;
  const retWinnersForced = points.filter((pt) => pt.server === server && pt.isReturn && pt.endedBy === player && pt.reason === 'Winner').length +
    points.filter((pt) => pt.server === server && pt.isReturn && pt.endedBy === server && pt.reason === 'ForcedError').length;
  const retUE = points.filter((pt) => pt.server === server && pt.isReturn && pt.endedBy === player && pt.reason === 'UnforcedError').length;
  return {
    gamesPlayed: gamesSet.size, totalReturnPts: returnPts1st.length + returnPts2nd.length, won1st, total1st: returnPts1st.length, won2nd, total2nd: returnPts2nd.length,
    retWinnersForced, retUE, ratio: retUE > 0 ? (retWinnersForced / retUE) : (retWinnersForced > 0 ? Infinity : 0),
  };
}

export function computeReturnStrokeBreakdown(points, player) {
  const server = other(player);
  const strokes = ['Forehand', 'Backhand'];
  return strokes.map((st) => {
    const wfe = points.filter((pt) => pt.server === server && pt.isReturn && strokeSide(pt.stroke) === st &&
      ((pt.endedBy === player && pt.reason === 'Winner') || (pt.endedBy === server && pt.reason === 'ForcedError'))).length;
    const ue = points.filter((pt) => pt.server === server && pt.isReturn && strokeSide(pt.stroke) === st && pt.endedBy === player && pt.reason === 'UnforcedError').length;
    return { stroke: st, wfe, ue };
  });
}

export function computeFirstServeFaults(points, player) {
  const counts = { Net: 0, Wide: 0, Long: 0 };
  points.filter((pt) => pt.server === player && pt.firstFaultLocation).forEach((pt) => { counts[pt.firstFaultLocation]++; });
  return counts;
}

export function computeErrorLocations(points, player) {
  const categories = ['2nd Serve', 'FH Return', 'BH Return', 'Forehand', 'Backhand', 'Volley', 'Smash'];
  const data = {};
  categories.forEach((c) => { data[c] = { Net: 0, Wide: 0, Long: 0 }; });
  points.filter((pt) => pt.endedBy === player && (pt.reason === 'UnforcedError' || pt.reason === 'DoubleFault')).forEach((pt) => {
    let cat = null;
    const side = strokeSide(pt.stroke);
    if (pt.reason === 'DoubleFault') cat = '2nd Serve';
    else if (pt.isReturn && side === 'Forehand') cat = 'FH Return';
    else if (pt.isReturn && side === 'Backhand') cat = 'BH Return';
    else if (pt.stroke && pt.stroke.startsWith('Volley')) cat = 'Volley';
    else if (pt.stroke && pt.stroke.startsWith('Smash')) cat = 'Smash';
    else if (side === 'Forehand') cat = 'Forehand';
    else if (side === 'Backhand') cat = 'Backhand';
    if (cat && pt.location) data[cat][pt.location]++;
  });
  return categories.map((c) => ({ category: c, Net: data[c].Net, Wide: data[c].Wide, Long: data[c].Long }));
}

export function computeRallyBreakdown(points, server) {
  const bucketIdx = (r) => (r <= 0 ? 0 : r >= 7 ? 6 : r - 1);
  const serverEnded = { green: new Array(7).fill(0), red: new Array(7).fill(0) };
  const receiverEnded = { green: new Array(7).fill(0), red: new Array(7).fill(0) };
  points.filter((pt) => pt.server === server && pt.reason !== 'DoubleFault').forEach((pt) => {
    const idx = bucketIdx(pt.rally);
    const bucket = pt.endedBy === server ? serverEnded : receiverEnded;
    if (pt.reason === 'Winner' || pt.reason === 'ForcedError') bucket.green[idx]++;
    else if (pt.reason === 'UnforcedError') bucket.red[idx]++;
  });
  return { cats: ['1', '2', '3', '4', '5', '6', '7+'], serverEnded, receiverEnded };
}

export function computeMomentumSeries(points) {
  let cum = 0;
  const series = [0];
  points.forEach((pt) => { cum += (pt.pointWinner === 'self' ? 1 : -1); series.push(cum); });
  return series;
}

/**
 * Single format-aware replay pass that derives:
 *  - set-boundary markers for the momentum chart
 *  - break points faced/saved/won per player
 *  - service games actually won (held) per player
 * Mirrors the original app's replayMatchAnalytics().
 */
export function replayMatchAnalytics(points, { sessionType, formatPreset }) {
  const boundaries = [];
  const gameBoundaries = [];
  const bp = {
    self: { facedServing: 0, savedServing: 0, facedReturning: 0, wonReturning: 0 },
    opp: { facedServing: 0, savedServing: 0, facedReturning: 0, wonReturning: 0 },
  };
  const svcGamesWon = { self: 0, opp: 0 };
  if (sessionType === 'practice' || points.length === 0) return { boundaries, gameBoundaries, bp, svcGamesWon };

  const cfg = getFormatConfig(formatPreset);
  let gp = { self: 0, opp: 0 }, sg = { self: 0, opp: 0 }, setsWonLocal = { self: 0, opp: 0 };
  let tb = false, tbp = { self: 0, opp: 0 };
  let mtb = false, mtbp = { self: 0, opp: 0 };

  points.forEach((pt, idx) => {
    const w = pt.pointWinner;
    if (mtb) {
      mtbp[w]++;
      if (Math.max(mtbp.self, mtbp.opp) >= 10 && Math.abs(mtbp.self - mtbp.opp) >= 2) {
        setsWonLocal[w]++;
        boundaries.push({ index: idx + 1, label: '[' + mtbp.self + '-' + mtbp.opp + ']' });
        mtb = false; mtbp = { self: 0, opp: 0 };
      }
      return;
    }
    if (tb) {
      tbp[w]++;
      if (Math.max(tbp.self, tbp.opp) >= 7 && Math.abs(tbp.self - tbp.opp) >= 2) {
        sg[w]++;
        boundaries.push({ index: idx + 1, label: sg.self + '-' + sg.opp });
        setsWonLocal[w]++;
        sg = { self: 0, opp: 0 }; gp = { self: 0, opp: 0 }; tb = false; tbp = { self: 0, opp: 0 };
        if (cfg.decider === 'mtb10' && setsWonLocal[w] < cfg.setsToWin && setsWonLocal.self === cfg.setsToWin - 1 && setsWonLocal.opp === cfg.setsToWin - 1) mtb = true;
      }
      return;
    }
    const srv = pt.server, returner = other(srv);
    const returnerPtsAfter = (returner === 'self' ? gp.self : gp.opp) + 1;
    const serverPts = (srv === 'self' ? gp.self : gp.opp);
    if (Math.max(returnerPtsAfter, serverPts) >= 4 && Math.abs(returnerPtsAfter - serverPts) >= 2) {
      bp[srv].facedServing++;
      if (w === srv) bp[srv].savedServing++;
      bp[returner].facedReturning++;
      if (w === returner) bp[returner].wonReturning++;
    }
    gp[w]++;
    if (Math.max(gp.self, gp.opp) >= 4 && Math.abs(gp.self - gp.opp) >= 2) {
      if (w === srv) svcGamesWon[srv]++;
      sg[w]++; gp = { self: 0, opp: 0 };
      gameBoundaries.push({ index: idx + 1, label: sg.self + '-' + sg.opp });
      const a = sg.self, b = sg.opp, target = cfg.gamesTarget;
      if ((Math.max(a, b) >= target && Math.abs(a - b) >= 2) || a === target + 1 || b === target + 1) {
        boundaries.push({ index: idx + 1, label: a + '-' + b });
        const setWinner = a > b ? 'self' : 'opp';
        setsWonLocal[setWinner]++;
        sg = { self: 0, opp: 0 };
        if (cfg.decider === 'mtb10' && setsWonLocal[setWinner] < cfg.setsToWin && setsWonLocal.self === cfg.setsToWin - 1 && setsWonLocal.opp === cfg.setsToWin - 1) mtb = true;
      } else if (a === target && b === target) {
        tb = true; tbp = { self: 0, opp: 0 };
      }
    }
  });
  return { boundaries, gameBoundaries, bp, svcGamesWon };
}

export function computeBreakPointStats(points, cfgOpts, player) {
  return replayMatchAnalytics(points, cfgOpts).bp[player];
}
