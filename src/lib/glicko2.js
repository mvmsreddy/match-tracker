// Glicko-2 rating system (Mark Glickman, "Example of the Glicko-2 System").
// Pure functions, no I/O — same style as engine.js/analytics.js. Used to
// compute src/lib/glicko2.js consumers' "Tracker Rating" from official
// tournament bracket results (see supabase/functions/compute-ratings).
//
// Scope note: this only ever needs win/loss per matchup, not margin —
// event_matches.score is unstructured text ("6-3, 6-4"), so score-margin
// weighting is out of scope (see plan doc Phase B).

const SCALE = 173.7178;
const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const TAU = 0.5; // system constant — constrains how fast volatility can change per period
const EPSILON = 0.000001;

export function defaultPlayerState() {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

function toGlicko2Scale({ rating, rd }) {
  return { mu: (rating - DEFAULT_RATING) / SCALE, phi: rd / SCALE };
}

function fromGlicko2Scale({ mu, phi }) {
  return { rating: mu * SCALE + DEFAULT_RATING, rd: phi * SCALE };
}

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu, muJ, phiJ) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

// Illinois algorithm root-find for the new volatility (Glicko-2 paper, step 5).
function computeNewVolatility({ delta, phi, v, sigma }) {
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) * (phi * phi + v + ex);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > EPSILON && iterations < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    iterations++;
  }

  return Math.exp(A / 2);
}

// player: {rating, rd, volatility}. results: [{opponent: {rating, rd}, score: 1|0|0.5}]
// (opponent ratings are each opponent's rating AT THE START of the period —
// see computeRatingPeriod, which enforces this by reading from the
// pre-period snapshot for every player, not from partially-updated results).
export function updatePlayerRating(player, results) {
  const { mu, phi } = toGlicko2Scale(player);
  const sigma = player.volatility ?? DEFAULT_VOLATILITY;

  if (!results || results.length === 0) {
    // Step 8 — no games this period: RD grows toward uncertainty, rating and
    // volatility are unchanged. This is the actual mechanism behind the
    // "Provisional" badge going away and coming back for inactive players.
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...fromGlicko2Scale({ mu, phi: phiStar }), volatility: sigma };
  }

  const opponents = results.map((r) => toGlicko2Scale(r.opponent));
  const gs = opponents.map((o) => g(o.phi));
  const es = opponents.map((o, i) => expectedScore(mu, o.mu, o.phi));

  const vInv = results.reduce((sum, r, i) => sum + gs[i] * gs[i] * es[i] * (1 - es[i]), 0);
  const v = 1 / vInv;

  const deltaSum = results.reduce((sum, r, i) => sum + gs[i] * (r.score - es[i]), 0);
  const delta = v * deltaSum;

  const sigmaPrime = computeNewVolatility({ delta, phi, v, sigma });

  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return { ...fromGlicko2Scale({ mu: muPrime, phi: phiPrime }), volatility: sigmaPrime };
}

// Batch-updates every subject in one rating period. `playersByKey` is a
// Map<subjectKey, {rating, rd, volatility}> (unseen keys default to a fresh
// player). `matchResults` is [{winnerKey, loserKey}] — every player who
// appears is updated once, using every opponent's PRE-period rating (the
// Glicko-2 spec updates a whole period simultaneously, not match-by-match).
export function computeRatingPeriod(playersByKey, matchResults) {
  const resultsByKey = new Map();
  const ensure = (key) => {
    if (!resultsByKey.has(key)) resultsByKey.set(key, []);
    return resultsByKey.get(key);
  };
  const stateOf = (key) => playersByKey.get(key) || defaultPlayerState();

  for (const { winnerKey, loserKey } of matchResults) {
    if (!winnerKey || !loserKey || winnerKey === loserKey) continue;
    ensure(winnerKey).push({ opponent: stateOf(loserKey), score: 1 });
    ensure(loserKey).push({ opponent: stateOf(winnerKey), score: 0 });
  }

  const updated = new Map();
  for (const [key, results] of resultsByKey) {
    updated.set(key, updatePlayerRating(stateOf(key), results));
  }
  return updated;
}

// Rescale to the 1.0–10.0 display band this app surfaces (see
// PlayerRatingCard) — purely cosmetic, echoing the "PGR"-style single-number
// framing without implying it's the same algorithm's internal scale.
// Centered so DEFAULT_RATING (1500) maps to 5.0; ±3 Glicko rating-points-per-
// 100 keeps the practical 800-2200 range inside 1.0-10.0 without clipping
// for all but the most extreme ratings.
export function toDisplayRating(rating) {
  const value = 5 + (rating - DEFAULT_RATING) / 175;
  return Math.max(1, Math.min(10, Math.round(value * 10) / 10));
}

export function isProvisional({ rd, matchesCount }) {
  return rd > 100 || matchesCount < 5;
}
