// ============================================================
// Rank-based nomination placement — requirements §4
// New nominees are sorted into Main / Qualifying / Alternates by
// ranking, not first-come. A new entrant who outranks the worst
// direct-accepted player in a full bucket bumps that player down
// one tier (Main -> Qualifying -> Alternates); the chain is at most
// two bumps deep, so no full re-sort of the field is needed.
// Lower ranking number = better; unranked players sort last.
// ============================================================

const UNRANKED = Infinity;

function rankOf(entry) {
  return entry.ranking == null ? UNRANKED : entry.ranking;
}

function worstOf(list) {
  if (list.length === 0) return null;
  return list.reduce((worst, e) => (rankOf(e) > rankOf(worst) ? e : worst), list[0]);
}

function nextOpenPosition(taken, from, upTo) {
  let pos = from;
  while (taken.has(pos) && (upTo == null || pos <= upTo)) pos++;
  return pos;
}

// Places `demoted` into qualifying, bumping the worst qualifying entry to
// alternates if qualifying is full and `demoted` outranks it.
function placeIntoQualifying(demoted, qualEntries, altEntries, maxQualDirect, qualifyingSize) {
  const bumps = [];
  if (qualEntries.length < maxQualDirect) {
    const taken = new Set(qualEntries.map(e => e.position));
    const position = nextOpenPosition(taken, 1, qualifyingSize);
    return { placement: { drawType: 'qualifying', position, isAlternate: false }, bumps };
  }

  const worstQual = worstOf(qualEntries);
  if (worstQual && rankOf(demoted) < rankOf(worstQual)) {
    const altTaken = new Set(altEntries.map(e => e.position));
    const altPosition = nextOpenPosition(altTaken, Math.max(...altEntries.map(e => e.position), 0) + 1);
    bumps.push({ id: worstQual.id, drawType: 'main', position: altPosition, isAlternate: true, from: 'qualifying' });
    return { placement: { drawType: 'qualifying', position: worstQual.position, isAlternate: false }, bumps };
  }

  const altTaken = new Set(altEntries.map(e => e.position));
  const altPosition = nextOpenPosition(altTaken, Math.max(...altEntries.map(e => e.position), 0) + 1);
  return { placement: { drawType: 'main', position: altPosition, isAlternate: true }, bumps };
}

// Pure function — no I/O. Returns:
//   { placement: {drawType, position, isAlternate}, bumps: [{id, drawType, position, isAlternate, from}] }
// `bumps` must be applied to the DB in array order (already bottom-up:
// alternates vacated before qualifying, qualifying before main) before the
// new entrant's own row is inserted at `placement`.
export function computeCascadingPlacement(mainEntries, qualEntries, altEntries, newEntrant, maxMainDirect, maxQualDirect, drawSize, qualifyingSize) {
  if (mainEntries.length < maxMainDirect) {
    const taken = new Set(mainEntries.map(e => e.position));
    const position = nextOpenPosition(taken, 1, drawSize);
    return { placement: { drawType: 'main', position, isAlternate: false }, bumps: [] };
  }

  const worstMain = worstOf(mainEntries);
  if (worstMain && rankOf(newEntrant) < rankOf(worstMain)) {
    const { placement: demotedPlacement, bumps: innerBumps } =
      placeIntoQualifying(worstMain, qualEntries, altEntries, maxQualDirect, qualifyingSize);
    const bumps = [...innerBumps, { id: worstMain.id, ...demotedPlacement, from: 'main' }];
    return { placement: { drawType: 'main', position: worstMain.position, isAlternate: false }, bumps };
  }

  const { placement, bumps } = placeIntoQualifying(newEntrant, qualEntries, altEntries, maxQualDirect, qualifyingSize);
  return { placement, bumps };
}
