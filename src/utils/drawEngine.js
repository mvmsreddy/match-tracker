// ============================================================
// Draw Engine — ITF/AITA seeding placement + BYE fill logic
// Pure functions, no side effects, no API calls.
//
// Every function here that takes a `drawSize` expects the PHYSICAL bracket
// size (a power of two — see bracketSize() in aitaGradeRules.js), not the
// nominal AITA draw size. A "48" nominal draw is physically a 64-slot
// bracket with 16 BYEs — callers are responsible for padding before calling
// in here. Verified against real AITA draw sheets (NS U14, July 2026).
// ============================================================
import { bracketSize } from './aitaGradeRules';

export { bracketSize };

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// getSeededPositions(drawSize, numSeeds)  — MAIN DRAW only.
//
// Returns array where result[i] is the 1-based draw position for seed (i+1).
//
// Verified against real AITA main-draw sheets (N=16 doubles, N=64 singles):
//   Seed 1     → position 1
//   Seed 2     → position N
//   Seeds 3-4  → drawn to {N/4+1, 3N/4}
//   Seeds 5-8  → drawn to {N/8+1, 3N/8, 5N/8+1, 7N/8}
//   Seeds 9-16 → drawn to whichever N/8-boundary positions tiers 1-8 left
//                unclaimed (exactly 8 remain when numSeeds=16)
// ---------------------------------------------------------------------------
export function getSeededPositions(drawSize, numSeeds) {
  const positions = [];

  if (numSeeds < 1) return positions;
  positions.push(1);             // Seed 1
  if (numSeeds < 2) return positions;
  positions.push(drawSize);      // Seed 2

  if (numSeeds >= 4) {
    const q = drawSize / 4;
    const pool34 = shuffle([q + 1, 3 * q]);
    positions.push(pool34[0]);   // Seed 3
    positions.push(pool34[1]);   // Seed 4
  }

  if (numSeeds >= 8) {
    const e = drawSize / 8;
    const pool58 = shuffle([e + 1, 3 * e, 5 * e + 1, 7 * e]);
    pool58.forEach(p => positions.push(p)); // Seeds 5-8
  }

  if (numSeeds >= 16) {
    const e = drawSize / 8;
    const taken = new Set(positions);
    const candidates = [];
    for (let i = 1; i <= 7; i++) {
      const lo = i * e, hi = i * e + 1;
      if (!taken.has(lo)) candidates.push(lo);
      if (!taken.has(hi)) candidates.push(hi);
    }
    const pool916 = shuffle(candidates).slice(0, 8);
    pool916.forEach(p => positions.push(p)); // Seeds 9-16
  }

  return positions;
}

// ---------------------------------------------------------------------------
// getQualifyingSeededPositions(drawSize, numSeeds)  — QUALIFYING DRAW only.
//
// A materially different, simpler algorithm from the main draw: qualifying
// doesn't crown a single champion (it stops at the "deciding round" once
// enough winners exist to fill the promotion spots), so it doesn't need the
// main draw's "protect top seeds from meeting" recursive halving — it just
// spreads seeds evenly. Verified against real sheets (N=32/8 seeds,
// N=64/16 seeds): unit = N/8; seed k (k<=8) → 1+(k-1)*unit;
// seed k (9<=k<=16) → (k-8)*unit.
// ---------------------------------------------------------------------------
export function getQualifyingSeededPositions(drawSize, numSeeds) {
  const positions = [];
  const unit = drawSize / 8;
  for (let k = 1; k <= Math.min(numSeeds, 8); k++) {
    positions.push(1 + (k - 1) * unit);
  }
  for (let k = 9; k <= numSeeds; k++) {
    positions.push((k - 8) * unit);
  }
  return positions;
}

// ---------------------------------------------------------------------------
// applySeeding(entries, drawSize, numSeeds, drawType = 'main')
//
// Rearranges entries so seeded players land on their ITF positions.
// Unseeded players fill remaining slots, sorted by ranking (lower = better).
// BYEs are dropped — call fillByes afterwards to repopulate gaps.
//
// drawType picks the seed-placement algorithm: 'main' uses the protect-top-
// seeds ITF formula, 'qualifying' uses the simpler evenly-spaced formula
// (see getQualifyingSeededPositions above — the two are NOT interchangeable).
//
// Returns a new array of entry objects with updated `position` field.
// ---------------------------------------------------------------------------
export function applySeeding(entries, drawSize, numSeeds, drawType = 'main') {
  const seeded   = entries.filter(e => e.seed && !e.isBye).sort((a, b) => a.seed - b.seed);
  const unseeded = entries.filter(e => !e.seed && !e.isBye).sort((a, b) => {
    if (a.ranking && b.ranking) return a.ranking - b.ranking;
    return a.ranking ? -1 : b.ranking ? 1 : 0;
  });
  return _placeInDraw(seeded, unseeded, drawSize, numSeeds, drawType);
}

// ---------------------------------------------------------------------------
// randomizeDraw(entries, drawSize, numSeeds, drawType = 'main')
//
// Same as applySeeding but unseeded players are placed in RANDOM order rather
// than sorted by ranking — this is the proper AITA random draw procedure.
// Seeded players still land on their ITF/qualifying draw positions.
// BYEs are dropped — call fillByes afterwards to repopulate gaps.
// ---------------------------------------------------------------------------
export function randomizeDraw(entries, drawSize, numSeeds, drawType = 'main') {
  const seeded   = entries.filter(e => e.seed && !e.isBye).sort((a, b) => a.seed - b.seed);
  const unseeded = shuffle(entries.filter(e => !e.seed && !e.isBye)); // random order
  return _placeInDraw(seeded, unseeded, drawSize, numSeeds, drawType);
}

// Internal helper used by both applySeeding and randomizeDraw
function _placeInDraw(seeded, unseeded, drawSize, numSeeds, drawType) {

  const seedPositions = drawType === 'qualifying'
    ? getQualifyingSeededPositions(drawSize, numSeeds)
    : getSeededPositions(drawSize, numSeeds);
  const result        = new Map(); // position → entry

  // Place seeds
  seeded.forEach((entry, idx) => {
    const pos = seedPositions[idx];
    if (pos) result.set(pos, { ...entry, position: pos });
  });

  // Fill unseeded into remaining positions
  const taken    = new Set(result.keys());
  const openSlots = [];
  for (let i = 1; i <= drawSize; i++) if (!taken.has(i)) openSlots.push(i);

  unseeded.forEach((entry, idx) => {
    if (idx < openSlots.length) {
      const pos = openSlots[idx];
      result.set(pos, { ...entry, position: pos });
    }
  });

  return [...result.values()].sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------------
// getByePositions(drawSize, entries)
//
// Returns sorted array of positions that should receive BYEs.
// BYEs go adjacent to seeds first (protect top seeds from opponents in R1),
// then fill remaining empty positions top-to-bottom.
//
// "Adjacent" means the R1 opponent slot:
//   odd position p  → paired with p+1
//   even position p → paired with p-1
// ---------------------------------------------------------------------------
export function getByePositions(drawSize, entries) {
  const playerPositions = new Set(entries.filter(e => !e.isBye).map(e => e.position));
  const byePositions    = [];
  const claimed         = new Set(playerPositions);

  const pairOf = p => (p % 2 === 1 ? p + 1 : p - 1);

  // Adjacent to each seed, in seed order
  const seeded = entries
    .filter(e => e.seed && !e.isBye)
    .sort((a, b) => a.seed - b.seed);

  for (const entry of seeded) {
    const pair = pairOf(entry.position);
    if (pair >= 1 && pair <= drawSize && !claimed.has(pair)) {
      byePositions.push(pair);
      claimed.add(pair);
    }
  }

  // Remaining empty slots top-to-bottom
  for (let i = 1; i <= drawSize; i++) {
    if (!claimed.has(i)) {
      byePositions.push(i);
      claimed.add(i);
    }
  }

  return byePositions;
}

// ---------------------------------------------------------------------------
// buildByeEntries(drawSize, entries)
//
// Builds the BYE entry objects needed to fill the draw.
// ---------------------------------------------------------------------------
export function buildByeEntries(drawSize, entries) {
  const positions = getByePositions(drawSize, entries);
  return positions.map(pos => ({
    position: pos,
    isBye: true,
    familyName: 'BYE',
    firstName: '',
    seed: null,
    aitaReg: null,
    playerState: null,
    ranking: null,
    statusCode: null,
    isAlternate: false,
  }));
}

// ---------------------------------------------------------------------------
// swapPositions(entries, posA, posB)
//
// Returns new entries array with positions of posA and posB swapped.
// ---------------------------------------------------------------------------
export function swapPositions(entries, posA, posB) {
  return entries.map(e => {
    if (e.position === posA) return { ...e, position: posB };
    if (e.position === posB) return { ...e, position: posA };
    return e;
  }).sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------------
// buildR1Matches(entries, drawSize)
//
// Returns array of { slot, pos1, pos2, entry1, entry2 } for draw-sheet display.
// ---------------------------------------------------------------------------
export function buildR1Matches(entries, drawSize) {
  const map = new Map(entries.map(e => [e.position, e]));
  const matches = [];
  for (let i = 1; i <= drawSize; i += 2) {
    matches.push({
      slot: Math.ceil(i / 2),
      pos1: i,
      pos2: i + 1,
      entry1: map.get(i) || null,
      entry2: map.get(i + 1) || null,
    });
  }
  return matches;
}
