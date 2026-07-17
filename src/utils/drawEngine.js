// ============================================================
// Draw Engine — ITF seeding placement + BYE fill logic
// Pure functions, no side effects, no API calls.
// ============================================================

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
// getSeededPositions(drawSize, numSeeds)
//
// Returns array where result[i] is the 1-based draw position for seed (i+1).
//
// ITF/AITA rules:
//   Seed 1  → position 1       (top of draw)
//   Seed 2  → position N       (bottom of draw)
//   Seeds 3-4  → drawn to {N/2, N/2+1}      (end H1 / start H2)
//   Seeds 5-8  → drawn to {N/4, N/4+1, 3N/4, 3N/4+1}  (quarter ends)
//   Seeds 9-16 → drawn to eighth boundaries (filtered to avoid taken positions)
// ---------------------------------------------------------------------------
export function getSeededPositions(drawSize, numSeeds) {
  const positions = [];

  if (numSeeds < 1) return positions;
  positions.push(1);             // Seed 1
  if (numSeeds < 2) return positions;
  positions.push(drawSize);      // Seed 2

  if (numSeeds >= 4) {
    const half = drawSize / 2;
    const pool34 = shuffle([half, half + 1]);
    positions.push(pool34[0]);   // Seed 3
    positions.push(pool34[1]);   // Seed 4
  }

  if (numSeeds >= 8) {
    const q = drawSize / 4;
    const pool58 = shuffle([q, q + 1, 3 * q, 3 * q + 1]);
    pool58.forEach(p => positions.push(p)); // Seeds 5-8
  }

  if (numSeeds >= 16) {
    const e = drawSize / 8;
    const taken = new Set(positions);
    const candidates = [];
    for (let i = 1; i <= 7; i += 2) {
      candidates.push(i * e, i * e + 1);
    }
    const pool916 = shuffle(candidates.filter(p => !taken.has(p))).slice(0, 8);
    pool916.forEach(p => positions.push(p)); // Seeds 9-16
  }

  return positions;
}

// ---------------------------------------------------------------------------
// applySeeding(entries, drawSize, numSeeds)
//
// Rearranges entries so seeded players land on their ITF positions.
// Unseeded players fill remaining slots, sorted by ranking (lower = better).
// BYEs are dropped — call fillByes afterwards to repopulate gaps.
//
// Returns a new array of entry objects with updated `position` field.
// ---------------------------------------------------------------------------
export function applySeeding(entries, drawSize, numSeeds) {
  const seeded   = entries.filter(e => e.seed && !e.isBye).sort((a, b) => a.seed - b.seed);
  const unseeded = entries.filter(e => !e.seed && !e.isBye).sort((a, b) => {
    if (a.ranking && b.ranking) return a.ranking - b.ranking;
    return a.ranking ? -1 : b.ranking ? 1 : 0;
  });

  const seedPositions = getSeededPositions(drawSize, numSeeds);
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
