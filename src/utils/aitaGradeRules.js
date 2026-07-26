// ============================================================
// AITA Junior Circuit draw rules — verified 2026-07-20 against the source
// PDF (Rules_Collated_AITA_Junior_Circuit_Tournaments_2026.pdf) via
// pdfplumber table extraction, not just the pre-parsed knowledge base.
//
// Two numbers in the PDF are grade-independent constants, not per-grade
// choices: every acceptance-list grade (TS7/CS7/SS/NS/Nationals) uses
// exactly 8 qualifiers + 1 special exempt in the Main Draw (0 wild cards),
// and exactly 4 wild cards in the Qualifying Draw, regardless of draw size.
// Only the draw SIZE varies by grade/gender — the composition split is a
// pure function of size (drawSize - 9 direct, qualSize - 4 direct).
//
// TS7 and CS7 qualifying draws are explicitly "Open (no cap)" in the PDF —
// there is no fixed qualifying size for these grades. This app's schema
// needs a concrete number to seed the form with, so we mark these
// `qualifyingOpen: true` and surface a UI hint rather than silently
// pretending the number is authoritative.
//
// Seed counts: the PDF only states an explicit seed formula (8 seeds for a
// draw of 32, 16 for a draw of >32) for CS3, based on players SIGNED IN
// (not nominal draw size). For TS7/CS7/SS/NS/Nationals the PDF just says
// seeding follows AITA rankings, with no printed seed-count table — the
// same 8/16 split is standard ITF practice, but here it's an inference,
// not a verbatim rule. `seedCountForDraw()` is that inference.
// ============================================================

export const QUALIFIERS_INTO_MAIN = 8;   // fixed regardless of draw size
export const SPECIAL_EXEMPT_SLOTS = 1;   // fixed regardless of draw size
export const WILD_CARDS_IN_QUALIFYING = 4; // fixed regardless of qual draw size
export const WILD_CARDS_IN_MAIN = 0;     // no wild cards in any main draw

export const DOUBLES_DRAW_SIZE = 16;
export const DOUBLES_NUM_SEEDS = 4; // verified against real NS U14 doubles sheets — NOT seedCountForDraw(16)
export const DOUBLES_MIN_PAIRS_FOR_POINTS = 8;
export const SINGLES_MIN_PLAYERS_FOR_POINTS = 16;

// A "48" nominal draw size isn't a power of two, so it can't be a physical
// single-elimination bracket on its own — real AITA sheets pad it to the
// next power of two (64) with BYEs, e.g. Seed 2 sits at physical position
// 64, not 48. This is the physical slot count for all bracket-topology math
// (seed placement, BYE placement, round generation) — 32/64/128 pass through
// unchanged since they're already powers of two.
export function bracketSize(nominalSize) {
  if (!nominalSize || nominalSize < 2) return nominalSize || 0;
  return Math.pow(2, Math.ceil(Math.log2(nominalSize)));
}

const GRADE_RULES = {
  'talent series': {
    label: 'Talent Series (7 Days)',
    drawSize: { boys: 32, girls: 32 },
    qualifying: { open: true },
  },
  'championship series (3-day)': {
    label: 'Championship Series (3 Days)',
    drawSize: { boys: 48, girls: 48 },
    qualifying: null, // no qualifying draw at all — walk-in sign-in only
  },
  'championship series (7-day)': {
    label: 'Championship Series (7 Days)',
    drawSize: { boys: 32, girls: 32 },
    qualifying: { open: true },
  },
  'super series': {
    label: 'Super Series',
    drawSize: { boys: 32, girls: 32 },
    qualifying: { open: false, boys: 48, girls: 32 },
  },
  'national series': {
    label: 'National Series',
    drawSize: { boys: 64, girls: 48 },
    qualifying: { open: false, boys: 48, girls: 32 },
  },
  'nationals': {
    label: 'Nationals',
    drawSize: { boys: 64, girls: 48 },
    qualifying: { open: false, boys: 64, girls: 48 },
  },
};

// No-show penalty points by grade (deducted from ranking). Not listed for
// CS3 (no ranking-points system engages there beyond a flat no-show fine).
export const NO_SHOW_PENALTY_POINTS = {
  'talent series': 5,
  'championship series (7-day)': 5,
  'super series': 5,
  'national series': 10,
  'nationals': 15,
};

// Grades where the "3rd+ late withdrawal in a calendar year" rule applies
// (flat -15 points from the 3rd occurrence onward).
export const LATE_WITHDRAWAL_PENALTY_GRADES = new Set(['super series', 'national series', 'nationals']);
export const LATE_WITHDRAWAL_PENALTY_POINTS = 15;

// Entry lifecycle stages — verified against the source PDF's three-stage
// withdrawal structure: "Till Withdrawal Deadline – Via AITA Login",
// "After the Withdrawal Deadline till the Freeze Deadline – Via AITA Login",
// "After the freeze deadline... Via Email to the Tournament Referee". Entry
// itself closes at entryDeadline, earlier than either withdrawal stage.
export const ENTRY_STAGE = {
  OPEN: 'open',                       // entry + on-time withdrawal both allowed
  ENTRY_CLOSED: 'entry_closed',       // no new entries; on-time withdrawal still allowed
  LATE_WITHDRAWAL: 'late_withdrawal', // no new entries; withdrawal allowed but counts as late
  FROZEN: 'frozen',                   // no self-service entry or withdrawal — referee only, by email
};

// entryDeadline/withdrawalDeadline are date-only (YYYY-MM-DD) — the rule
// text gives no time-of-day for them, so treat the whole day as valid and
// only close at day's end. freezeDeadline is a full timestamp (1700 Hrs
// Thursday, per the rules) and is compared as-is.
function endOfDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function getEntryStage({ entryDeadline, withdrawalDeadline, freezeDeadline }, now = new Date()) {
  const t = now.getTime();
  if (freezeDeadline && t >= new Date(freezeDeadline).getTime()) return ENTRY_STAGE.FROZEN;
  if (withdrawalDeadline && t > endOfDay(withdrawalDeadline)) return ENTRY_STAGE.LATE_WITHDRAWAL;
  if (entryDeadline && t > endOfDay(entryDeadline)) return ENTRY_STAGE.ENTRY_CLOSED;
  return ENTRY_STAGE.OPEN;
}

// Max AITA tournaments/year per player's own (natural) age group — U18 has
// no cap. Counts both main draw and qualifying, singles + doubles combined
// at one tournament/age-group = 1; ITF/ATF tournaments are excluded.
export const ANNUAL_TOURNAMENT_LIMITS = { U10: null, U12: 18, U14: 25, U16: 30, U18: null };

export function normalizeGradeKey(grade) {
  const g = (grade || '').toLowerCase();
  if (g.includes('national series')) return 'national series';
  if (g.includes('super series')) return 'super series';
  if (g.includes('nationals')) return 'nationals';
  if (g.includes('championship') && g.includes('3')) return 'championship series (3-day)';
  if (g.includes('championship') || g.includes('talent') || g.includes('state')) return 'championship series (7-day)';
  return null; // ITF grades, Satellite, unrecognized — no AITA composition rules apply
}

// Standard-practice inference (see file header) — not verbatim for every grade.
export function seedCountForDraw(drawSize) {
  return drawSize > 32 ? 16 : 8;
}

// Verified: direct = drawSize - 9 (8 qualifiers + 1 SE), 0 wild cards.
export function mainDrawComposition(drawSize) {
  if (!drawSize || drawSize <= QUALIFIERS_INTO_MAIN + SPECIAL_EXEMPT_SLOTS) return null;
  return {
    directAcceptance: drawSize - QUALIFIERS_INTO_MAIN - SPECIAL_EXEMPT_SLOTS,
    qualifiers: QUALIFIERS_INTO_MAIN,
    specialExempt: SPECIAL_EXEMPT_SLOTS,
    wildCards: WILD_CARDS_IN_MAIN,
  };
}

// Verified: direct = qualSize - 4 wild cards.
export function qualifyingDrawComposition(qualSize) {
  if (!qualSize || qualSize <= WILD_CARDS_IN_QUALIFYING) return null;
  return { directAcceptance: qualSize - WILD_CARDS_IN_QUALIFYING, wildCards: WILD_CARDS_IN_QUALIFYING };
}

export function noShowPenaltyPoints(grade) {
  const key = normalizeGradeKey(grade);
  return key ? (NO_SHOW_PENALTY_POINTS[key] || 0) : 0;
}

export function usesLateWithdrawalPenalty(grade) {
  const key = normalizeGradeKey(grade);
  return key ? LATE_WITHDRAWAL_PENALTY_GRADES.has(key) : false;
}

// Replaces the old ad-hoc getDrawDefaults() heuristic in TournamentsListPage.
// Returns null drawSize/qualifyingSize fields gracefully for unrecognized
// grades so callers can fall back to their own defaults.
export function getAitaDrawDefaults(grade, category) {
  const isDoubles = /double/i.test(category);
  if (isDoubles) {
    return {
      drawSize: DOUBLES_DRAW_SIZE,
      numSeeds: DOUBLES_NUM_SEEDS,
      hasQualifying: false,
      qualifyingOpen: false,
      qualifyingSize: null,
      qualifyingSpots: 0,
      minForPoints: DOUBLES_MIN_PAIRS_FOR_POINTS,
    };
  }

  const isGirls = /girl|women/i.test(category);
  const key = normalizeGradeKey(grade);
  const rule = GRADE_RULES[key] || GRADE_RULES['championship series (7-day)'];

  const drawSize = isGirls ? rule.drawSize.girls : rule.drawSize.boys;
  const q = rule.qualifying;
  const hasQualifying = !!q;
  const qualifyingOpen = !!(q && q.open);
  const qualifyingSize = hasQualifying
    ? (qualifyingOpen ? drawSize : (isGirls ? q.girls : q.boys))
    : null;

  return {
    drawSize,
    numSeeds: seedCountForDraw(drawSize),
    hasQualifying,
    qualifyingOpen,
    qualifyingSize,
    qualifyingSpots: hasQualifying ? QUALIFIERS_INTO_MAIN : 0,
    minForPoints: SINGLES_MIN_PLAYERS_FOR_POINTS,
  };
}

// The gender a category is restricted to, or null for Mixed Doubles (which
// takes one player of each gender as partners — not a self-entry gate).
export function categoryGender(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('mixed')) return null;
  return /girl|women/.test(c) ? 'F' : 'M';
}

// ============================================================
// Ranking points by round — Section 13 of
// New folder/AITA_Rules_Knowledge_Base.md ("Ranking Points by Round"),
// itself extracted from Rules_Collated_AITA_Junior_Circuit_Tournaments_2026.pdf.
// Powers the Player Coaching Dashboard's Recommendations tab ("Suggested
// entries" expected-points estimate) — real points table, not a guess.
//
// Keyed separately from GRADE_RULES/normalizeGradeKey above: that normalizer
// deliberately collapses Talent Series and Championship Series (7-day) into
// one key for draw-composition purposes (where they match), but TS and CS7
// have different point tables (below), so this needs its own six-way split.
// ============================================================

export const POINTS_BY_ROUND = {
  TS:  { R32: 2, R16: 6, QF: 8, SF: 10, F: 12, W: 15 },
  CS3: { R32: 1, R16: 3, QF: 4, SF: 6, F: 8, W: 10 },
  CS7: { R32: 4, R16: 8, QF: 10, SF: 15, F: 20, W: 25 },
  SS:  { R32: 5, R16: 10, QF: 20, SF: 30, F: 40, W: 50 },
  NS:  { R64: 5, R32: 10, R16: 20, QF: 30, SF: 40, F: 50, W: 75 },
  NAT: { R64: 20, R32: 40, R16: 60, QF: 80, SF: 100, F: 150, W: 200 },
};

// Shallow → deep, for comparing "how far a player got" and for roundToken() below.
export const ROUND_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'F', 'W'];

export function roundDepth(round) {
  return ROUND_ORDER.indexOf(round);
}

// Six-way grade → points-table key. Same free-text pattern-matching approach
// as TrackerPage.jsx's local mapAitaGradeToCircuit, but distinguishing all
// six grades since (unlike normalizeGradeKey above) TS and CS7 must not collapse.
export function normalizePointsGradeKey(grade) {
  const g = (grade || '').toLowerCase();
  if (g.includes('national series')) return 'NS';
  if (g.includes('super series')) return 'SS';
  if (g.includes('nationals') || /\bnat\b/.test(g)) return 'NAT';
  if (g.includes('talent')) return 'TS';
  if (g.includes('championship') && (/\bcs\s*-?\s*3\b/.test(g) || g.includes('3 day') || g.includes('3-day'))) return 'CS3';
  if (g.includes('championship') || /\bcs\s*-?\s*7\b/.test(g) || g.includes('7 day') || g.includes('7-day')) return 'CS7';
  if (/\bts\b/.test(g)) return 'TS';
  if (/\bss\b/.test(g)) return 'SS';
  if (/\bns\b/.test(g)) return 'NS';
  return null;
}

export function pointsForRound(grade, round) {
  const key = normalizePointsGradeKey(grade);
  if (!key || !round) return null;
  const table = POINTS_BY_ROUND[key];
  return table ? (table[round] ?? null) : null;
}

// Converts a match's raw numeric `round` (1-based from the earliest round, as
// stored on event_matches) plus the tournament's *nominal* draw size into a
// canonical round token matching POINTS_BY_ROUND's keys. Mirrors
// drawPdf.js's local roundLabel() math (fromEnd = totalRounds - round) but
// emits R64/R32/R16/QF/SF/F/W tokens instead of PDF display text, and uses
// bracketSize() (above) since round counting runs off the power-of-two
// physical draw, not the nominal size (e.g. a nominal 48 pads to 64).
export function roundToken(matchRound, nominalDrawSize, won) {
  if (!matchRound || !nominalDrawSize) return null;
  const totalRounds = Math.ceil(Math.log2(bracketSize(nominalDrawSize)));
  const fromEnd = totalRounds - matchRound;
  if (fromEnd === 0) return won ? 'W' : 'F';
  if (fromEnd === 1) return 'SF';
  if (fromEnd === 2) return 'QF';
  if (fromEnd === 3) return 'R16';
  if (fromEnd === 4) return 'R32';
  if (fromEnd === 5) return 'R64';
  return null;
}

// Expected ranking points for a not-yet-entered event: this player's own
// historically-typical furthest round reached (a real ROUND_ORDER token,
// computed by the caller from this player's own past matches in the
// segment) priced at that round for the candidate event's actual grade.
// Real inputs only — no fabricated per-tournament number. Returns null when
// there's no historical round to price (caller should omit the figure, not
// show a fake one).
export function estimateExpectedPoints({ grade, historicalRound }) {
  if (!historicalRound) return null;
  return pointsForRound(grade, historicalRound);
}
