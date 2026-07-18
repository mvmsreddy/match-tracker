/**
 * AITA Tournament Factsheet PDF parser.
 * Extracts text from a PDF file using pdfjs-dist and maps known labels
 * to the TournamentWeek form fields.
 */
import * as pdfjsLib from 'pdfjs-dist';

// Vite-compatible worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------
async function extractText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let full = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Join items with a space; items that end a line usually have a trailing space already
    full += content.items.map(i => i.str).join(' ') + '\n';
  }
  return full;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the text that sits between two known label strings. */
function between(text, startLabel, endLabel, occurrence = 1) {
  let from = 0;
  let si = -1;
  for (let n = 0; n < occurrence; n++) {
    si = text.indexOf(startLabel, from);
    if (si === -1) return '';
    from = si + startLabel.length;
  }
  const valueStart = si + startLabel.length;
  const ei = endLabel ? text.indexOf(endLabel, valueStart) : text.length;
  return text
    .slice(valueStart, ei === -1 ? undefined : ei)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert "20 July 2026" → "2026-07-20".  Returns '' on failure. */
function toIso(raw) {
  if (!raw) return '';
  const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return '';
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return '';
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Parse a range like "20 July to 25 July 2026" → { start, end } ISO dates. */
function parseDateRange(raw) {
  const m = raw.match(/(\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)\s+to\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (m) {
    let first = m[1];
    const second = m[2];
    // Borrow year from second date if first has none
    if (!/\d{4}/.test(first)) {
      const yr = second.match(/\d{4}/);
      if (yr) first += ' ' + yr[0];
    }
    return { start: toIso(first), end: toIso(second) };
  }
  // Single date
  return { start: toIso(raw), end: '' };
}

/** Map "HARD" / "Hard court" → the SURFACES value used in the form. */
function normaliseSurface(raw) {
  const MAP = { hard: 'Hard', clay: 'Clay', grass: 'Grass', carpet: 'Carpet', artificial: 'Artificial Grass' };
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'Hard';
}

/** Parse a word-number like "Nine" or digit like "9". */
function parseCourts(raw) {
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const n = parseInt(raw);
  if (!isNaN(n)) return n;
  return WORDS[raw.toLowerCase().trim()] || 2;
}

/** Extract the first ₹ amount from a string, strip commas. */
function firstRupee(raw) {
  const m = raw.match(/[₹\u20B9]\s*([\d,]+)/);
  return m ? m[1].replace(/,/g, '') : '';
}

/** Extract the second ₹ amount from a string. */
function secondRupee(raw) {
  const matches = [...raw.matchAll(/[₹\u20B9]\s*([\d,]+)/g)];
  return matches[1] ? matches[1][1].replace(/,/g, '') : '';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse an AITA Tournament Factsheet PDF and return an object that matches
 * the EMPTY_FORM shape used in TournamentsListPage.
 *
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function parseFactsheetPdf(file) {
  const text = await extractText(file);

  // ── Basic info ──────────────────────────────────────────────────────────
  const name = between(text, 'NAME OF THE TOURNAMENT', 'NAME OF THE STATE ASSOCIATION');
  const subtitle = between(text, 'NAME OF THE STATE ASSOCIATION', 'HON. SECRETARY');

  // ── Dates ───────────────────────────────────────────────────────────────
  const datesRaw = between(text, 'TOURNAMENT DATES', 'TOURNAMENT CITY');
  const { start: startDate, end: endDate } = parseDateRange(datesRaw);

  const city = between(text, 'TOURNAMENT CITY', 'ONLINE ENTRY');

  // ── Tour info ────────────────────────────────────────────────────────────
  const grade = between(text, 'TOURNAMENT CATEGORY', 'AGE GROUP');

  const entryDeadlineRaw = between(text, 'ENTRY DEADLINE', 'WITHDRAWAL DEADLINE');
  const entryDeadline = toIso(entryDeadlineRaw);

  const withdrawalDeadlineRaw = between(text, 'WITHDRAWAL DEADLINE', 'DRAWS');
  const withdrawalDeadline = toIso(withdrawalDeadlineRaw);

  // ── Qualifying dates (from DRAWS table) ──────────────────────────────────
  // The sign-in cell for SINGLES QUALIFYING contains e.g. "Friday 17 July 2026 from 12noon..."
  // FIRST DAY and LAST DAY follow it.
  const qualBlock = between(text, 'SINGLES QUALIFYING', 'SINGLES MAIN');
  // Extract all dates in the block
  const allDatesInQual = [...qualBlock.matchAll(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/g)].map(m => m[1]);
  const qualifyingStartDate = allDatesInQual[1] ? toIso(allDatesInQual[1]) : '';
  const qualifyingEndDate = allDatesInQual[2] ? toIso(allDatesInQual[2]) : '';

  // Build sign-in instructions from the draws table
  const singlesQualSignIn = between(text, 'SINGLES QUALIFYING', 'SINGLES MAIN').match(/[\w\s,]+(?:from|till)\s[\d\w\s:]+(?:at\s\w+)?/i)?.[0] || '';
  const doublesSignIn = between(text, 'DOUBLES MAIN DRAW', 'VENUE DETAILS').match(/[\w\s,]+(?:from|till)\s[\d\w\s:]+(?:at\s\w+)?/i)?.[0] || '';
  const signinInstructions = [
    singlesQualSignIn ? `Qualifying sign-in: ${singlesQualSignIn.trim()}` : '',
    doublesSignIn ? `Doubles sign-in: ${doublesSignIn.trim()}` : '',
  ].filter(Boolean).join('\n');

  // ── Venue ────────────────────────────────────────────────────────────────
  const location = between(text, 'NAME OF THE VENUE', 'ADDRESS OF THE VENUE');
  const venueAddress = between(text, 'ADDRESS OF THE VENUE', 'CITY');

  // Venue CITY might repeat — skip as we already have tournament city
  const venuePincode = between(text, 'PINCODE', 'TELEPHONE NO.').replace(/\D/g, '');
  const venuePhone = between(text, 'TELEPHONE NO.', 'COURT SURFACE');

  const surfaceRaw = between(text, 'COURT SURFACE', 'BRAND OF BALLS');
  const surface = normaliseSurface(surfaceRaw);

  const ballBrand = between(text, 'BRAND OF BALLS', 'NO. OF MATCH');

  const courtsRaw = between(text, 'NO. OF MATCH COURTS', 'FLOODLIGHTS');
  const numCourts = parseCourts(courtsRaw);

  const floodlightsRaw = between(text, 'FLOODLIGHTS', 'TOURNAMENT OFFICIALS');
  const hasFloodlights = /yes/i.test(floodlightsRaw);

  // ── Officials ─────────────────────────────────────────────────────────────
  const directorName = between(text, 'TOURNAMENT DIRECTOR', 'MOBILE NO.');
  const directorPhone = between(text, 'MOBILE NO.', 'E-MAIL', 1);
  const directorEmail = between(text, 'E-MAIL', 'TOURNAMENT REFEREE', 1);

  const referee = between(text, 'TOURNAMENT REFEREE', 'MOBILE NO.');
  const refereePhone = between(text, 'MOBILE NO.', 'E-MAIL', 2);
  const refereeEmail = between(text, 'E-MAIL', 'HOTEL', 2);

  // ── Fees ─────────────────────────────────────────────────────────────────
  const feesBlock = between(text, 'ENTRY FEES', 'AGE ELIGIBILITY');
  const entryFeeSingles = firstRupee(feesBlock);
  const entryFeeDoubles = secondRupee(feesBlock);

  const daBlock = between(text, 'DAILY ALLOWANCE', 'AITA Registration');
  const dailyAllowance = firstRupee(daBlock);

  // ── State abbreviation ────────────────────────────────────────────────────
  // Not in factsheet; left blank for user to fill
  const stateAbbr = '';

  return {
    name,
    subtitle,
    tournamentCode: '',
    location,
    city,
    stateAbbr,
    surface,
    startDate,
    endDate,
    referee,
    numCourts,
    dayStartTime: '09:00',
    // Phase 12 fields
    grade,
    entryDeadline,
    withdrawalDeadline,
    qualifyingStartDate,
    qualifyingEndDate,
    directorName,
    directorPhone,
    directorEmail,
    refereePhone,
    refereeEmail,
    venueAddress,
    venuePincode,
    venuePhone,
    ballBrand,
    hasFloodlights,
    entryFeeSingles,
    entryFeeDoubles,
    dailyAllowance,
    signinInstructions,
  };
}
