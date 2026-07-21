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
