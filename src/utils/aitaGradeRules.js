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
export const DOUBLES_MIN_PAIRS_FOR_POINTS = 8;
export const SINGLES_MIN_PLAYERS_FOR_POINTS = 16;

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
      numSeeds: seedCountForDraw(DOUBLES_DRAW_SIZE),
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
