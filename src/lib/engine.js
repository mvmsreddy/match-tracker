import { getFormatConfig } from './constants';

export function other(p) {
  return p === 'self' ? 'opp' : 'self';
}

function freshEngineState(seedServer) {
  return {
    gamePts: { self: 0, opp: 0 },
    setGames: { self: 0, opp: 0 },
    sets: [],
    matchSetsWon: { self: 0, opp: 0 },
    inTiebreak: false,
    tiebreakPts: { self: 0, opp: 0 },
    tiebreakStarter: null,
    matchTiebreakActive: false,
    matchTiebreakPts: { self: 0, opp: 0 },
    matchTBStarter: null,
    matchOver: false,
    matchWinner: null,
    currentServer: seedServer,
    tiebreakCourtSide: 'deuce', // 'deuce' | 'ad' — court side for next TB point
    changeEnds: false,           // true when players must change ends before next point
  };
}

/**
 * Returns which player serves a given tiebreak point.
 * pointsPlayedSoFar = total TB points already completed (0 = none yet).
 * Rotation: starter serves 1, then alternating pairs of 2.
 */
function computeTBServer(starter, pointsPlayedSoFar) {
  if (pointsPlayedSoFar === 0) return starter;
  const block = Math.floor((pointsPlayedSoFar - 1) / 2);
  return block % 2 === 0 ? other(starter) : starter;
}

/**
 * Returns which court side the next TB point is served from.
 * Point 1 (idx 0): Deuce. Then alternates each point.
 */
function computeTBCourtSide(pointsPlayedSoFar) {
  return pointsPlayedSoFar % 2 === 0 ? 'deuce' : 'ad';
}

/**
 * Applies one point's outcome to a (mutable, local-only) draft engine state.
 * Mirrors the original app's recordPointOutcome/finalizeGame/finalizeSet.
 * Returns the human-readable "score after this point" string.
 */
function applyPoint(state, winner, sessionType, pointTarget, cfg) {
  if (sessionType === 'practice') {
    state.gamePts[winner]++;
    const a = state.gamePts.self, b = state.gamePts.opp;
    if (Math.max(a, b) >= pointTarget) {
      state.matchOver = true;
      state.matchWinner = a > b ? 'self' : 'opp';
      return 'FINAL (' + a + '-' + b + ')';
    }
    return a + '-' + b;
  }

  if (state.matchTiebreakActive) {
    state.matchTiebreakPts[winner]++;
    const a = state.matchTiebreakPts.self, b = state.matchTiebreakPts.opp;
    const tbTotal = a + b;
    state.changeEnds = tbTotal > 0 && tbTotal % 6 === 0;
    if (Math.max(a, b) >= 10 && Math.abs(a - b) >= 2) {
      state.sets.push({ self: a > b ? 1 : 0, opp: b > a ? 1 : 0, tiebreak: true, tb: { self: a, opp: b }, isMatchTiebreak: true });
      state.matchSetsWon[winner]++;
      state.matchTiebreakActive = false;
      state.changeEnds = false;
      state.matchOver = true;
      state.matchWinner = winner;
      return 'MATCH (MTB ' + a + '-' + b + ')';
    }
    state.currentServer = computeTBServer(state.matchTBStarter, tbTotal);
    state.tiebreakCourtSide = computeTBCourtSide(tbTotal);
    return a + '-' + b + ' (MTB)';
  }

  if (state.inTiebreak) {
    state.tiebreakPts[winner]++;
    const a = state.tiebreakPts.self, b = state.tiebreakPts.opp;
    const tbTotal = a + b;
    state.changeEnds = tbTotal > 0 && tbTotal % 6 === 0;
    if (Math.max(a, b) >= 7 && Math.abs(a - b) >= 2) {
      state.setGames[winner]++;
      finalizeSet(state, winner, true, cfg);
      return 'GAME/SET (TB ' + a + '-' + b + ')';
    }
    state.currentServer = computeTBServer(state.tiebreakStarter, tbTotal);
    state.tiebreakCourtSide = computeTBCourtSide(tbTotal);
    return a + '-' + b + ' (TB)';
  }

  state.gamePts[winner]++;
  const a = state.gamePts.self, b = state.gamePts.opp;
  if (Math.max(a, b) >= 4 && Math.abs(a - b) >= 2) {
    finalizeGame(state, winner, cfg);
    return 'GAME';
  }
  return formatGameScore(state);
}

function finalizeGame(state, winner, cfg) {
  state.setGames[winner]++;
  state.gamePts = { self: 0, opp: 0 };
  state.currentServer = other(state.currentServer);
  const a = state.setGames.self, b = state.setGames.opp;
  const target = cfg.gamesTarget;
  if ((Math.max(a, b) >= target && Math.abs(a - b) >= 2) || a === target + 1 || b === target + 1) {
    finalizeSet(state, a > b ? 'self' : 'opp', false, cfg);
  } else if (a === target && b === target) {
    state.inTiebreak = true;
    state.tiebreakPts = { self: 0, opp: 0 };
    state.tiebreakStarter = state.currentServer;
    state.tiebreakCourtSide = 'deuce';
  }
}

function finalizeSet(state, winner, wasTiebreak, cfg) {
  state.sets.push({
    self: state.setGames.self, opp: state.setGames.opp, tiebreak: wasTiebreak,
    tb: wasTiebreak ? { self: state.tiebreakPts.self, opp: state.tiebreakPts.opp } : null,
  });
  state.matchSetsWon[winner]++;
  state.setGames = { self: 0, opp: 0 };
  state.gamePts = { self: 0, opp: 0 };
  if (wasTiebreak) {
    // Receiver of the first TB serve starts the next set
    state.currentServer = other(state.tiebreakStarter);
    state.tiebreakStarter = null;
    state.tiebreakCourtSide = 'deuce';
    state.changeEnds = false;
  }
  state.inTiebreak = false;
  state.tiebreakPts = { self: 0, opp: 0 };
  if (state.matchSetsWon[winner] >= cfg.setsToWin) {
    state.matchOver = true;
    state.matchWinner = winner;
  } else if (cfg.decider === 'mtb10' && state.matchSetsWon.self === cfg.setsToWin - 1 && state.matchSetsWon.opp === cfg.setsToWin - 1) {
    state.matchTiebreakActive = true;
    state.matchTiebreakPts = { self: 0, opp: 0 };
    state.matchTBStarter = state.currentServer;
    state.tiebreakCourtSide = 'deuce';
  }
}

export function formatGameScore(state) {
  const labels = ['0', '15', '30', '40'];
  if (state.inTiebreak) return state.tiebreakPts.self + '-' + state.tiebreakPts.opp + ' (TB)';
  const a = state.gamePts.self, b = state.gamePts.opp;
  if (a < 4 && b < 4) return labels[a] + '-' + labels[b];
  if (a === b) return 'Deuce';
  if (a > b) return 'AD-40';
  return '40-AD';
}

/**
 * Replays the full points array and returns the resulting match state.
 * This is the single source of truth the UI derives everything from -
 * points[] is the only thing persisted; everything else is recomputed.
 */
export function computeEngineState(points, { sessionType, formatPreset, pointTarget }, seedServer = 'self') {
  const cfg = getFormatConfig(formatPreset);
  const state = freshEngineState(points.length > 0 ? points[0].server : seedServer);
  let lastScoreAfter = null;
  points.forEach((p) => {
    lastScoreAfter = applyPoint(state, p.pointWinner, sessionType, pointTarget, cfg);
  });
  return { ...state, lastScoreAfter };
}

/** Tags for a new point about to be committed: which set/game it belongs to. */
export function tagForNextPoint(points, sessionType, formatPreset, pointTarget) {
  const state = computeEngineState(points, { sessionType, formatPreset, pointTarget });
  return {
    set: state.sets.length + 1,
    game: state.setGames.self + state.setGames.opp + 1,
  };
}
