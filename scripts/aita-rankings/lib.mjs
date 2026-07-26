// Shared helpers for the AITA Rankings pipeline (Phase 1: Juniors format).
// See AITA_RANKINGS_PLAN.md at the repo root for the reverse-engineered
// site mechanics this implements.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const BASE = 'https://aitatennis.com';

export const CATEGORIES = {
  Boys: ['U-12', 'U-14', 'U-16', 'U-18'],
  Girls: ['U-12', 'U-14', 'U-16', 'U-18'],
  Men: ['Doubles', 'Singles'],
  Women: ['Doubles', 'Singles'],
  Seniors: ['35+ Doubles', '35+ Singles', '40+ Doubles', '40+ Singles', '45+ Doubles', '45+ Singles', '50+ Doubles', '50+ Singles', '55+ Doubles', '55+ Singles', '60+ Doubles', '60+ Singles', '65+ Doubles', '65+ Singles'],
  Seniorwomen: ['35+ Doubles', '35+ Singles', '40+ Doubles', '40+ Singles', '45+ Doubles', '45+ Singles', '50+ Doubles', '50+ Singles'],
  Wheelchair: ['Wheelchair-Mens-Doubles', 'Wheelchair-Mens-Singles', 'Wheelchair-Womens-Doubles', 'Wheelchair-Womens-Singles'],
};

// ---------------------------------------------------------------------
// Site mechanics (session-cookie AJAX dance for discovery, stateless GET
// for the actual PDF link) — see AITA_RANKINGS_PLAN.md section 2.
// ---------------------------------------------------------------------

async function get(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { cookie } : {} });
  const setCookie = res.headers.get('set-cookie');
  const newCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const text = await res.text();
  return { text, cookie: newCookie };
}

export async function listDatesFor(category, subcategory) {
  let cookie = '';
  ({ cookie } = await get(`${BASE}/playerranking/`, cookie));
  ({ cookie } = await get(`${BASE}/management/ajax/ranking.php?q=${encodeURIComponent(category)}`, cookie));
  const { text } = await get(`${BASE}/management/ajax/ranking2.php?q=${encodeURIComponent(subcategory)}`, cookie);
  return [...text.matchAll(/<option value="([\d-]+)">/g)].map(m => m[1]);
}

export async function pdfUrlFor(category, subcategory, date) {
  const url = `${BASE}/rankingresult/?cat=${encodeURIComponent(category)}&subcat=${encodeURIComponent(subcategory)}&date1=${date}`;
  const { text } = await get(url);
  const m = text.match(/href="([^"]*management\/upload\/ranking\/[^"]+\.pdf)"/i);
  if (!m) return { pdfUrl: null, sourceUrl: url };
  return { pdfUrl: new URL(m[1], `${BASE}/rankingresult/`).toString(), sourceUrl: url };
}

export async function extractPdfText(pdfUrl) {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(it => it.str).join('|') + '|';
  }
  return fullText;
}

// ---------------------------------------------------------------------
// Junior-format parser (Boys/Girls, all age groups — AITA_RANKINGS_PLAN.md
// section 4, format A). Other category types (Open/Seniors/Wheelchair) use
// different column layouts and need their own parser — not needed until
// Phase 3/4/5.
//
// AITA's own column count is NOT fixed at 5 numeric columns. Confirmed by
// fetching real PDFs across each combo's full history (2026-07-26): some
// categories/date-ranges insert an extra "bonus points" column (e.g. "Asian
// U-14", "Asian U-16", "25% PTS.") between LATE WL and the real Final total,
// and Boys/Girls U-18 use a 7-numeric-column layout with yet another order
// (X 2 / MENS / WOMEN'S columns, LATE WL moved near the end). A regex
// hardcoded to exactly 5 trailing numbers silently grabbed the wrong (bonus)
// column as total_points and dropped the real Final value entirely — this
// was wrong for Boys/Girls U-14 and Boys/Girls U-18 since their very first
// backfilled date, and for Boys/Girls U-16 from 2022-09-19 onward (both
// switched on the exact same date, confirming a real AITA site change).
//
// Fix: the ONE invariant that holds across every format seen is that the
// real Final/TTL total is always the LAST numeric column before the next
// row starts. So instead of a fixed count, lazily consume numeric columns
// one at a time until a lookahead confirms the next row's rank+name is
// starting (or end of text) — whatever was captured, the last number is
// total_points, no matter how many columns preceded it.
const JUNIOR_ROW_RE = /(\d+)\|\s*\|([A-Z][A-Z .'-]*?)\|\s*\|(\d+)\|\s*\|(\d{1,2}-[A-Za-z]{3}-\d{2})\|\s*\|\(([A-Z]{2})\)\|\s*\|((?:[\d.]+\|(?:\s*\|)?)+?)(?=\d+\|\s*\|[A-Z]|$)/g;

// Maps the numeric columns preceding the real total (already excluded) onto
// named fields when the layout is one we recognize, so the existing
// rankings-table UI (Singles/Doubles/25% Best Dbls columns) keeps working.
// Anything else (currently: Boys/Girls U-18's 6-preceding-column layout,
// which reorders LATE WL and adds differently-named bonus columns) is kept
// positionally rather than mislabeled under the wrong name.
function buildPointsBreakdown(nums) {
  if (nums.length === 4) {
    const [singlesPts, doublesPts, best25DoublesPts, cutPts] = nums;
    return { singlesPts, doublesPts, best25DoublesPts, cutPts };
  }
  if (nums.length === 5) {
    const [singlesPts, doublesPts, best25DoublesPts, cutPts, bonusPts] = nums;
    return { singlesPts, doublesPts, best25DoublesPts, cutPts, bonusPts };
  }
  const breakdown = {};
  nums.forEach((v, i) => { breakdown[`col${i + 1}`] = v; });
  return breakdown;
}

// DOB is printed as DD-Mon-YY (2-digit year) — junior/open players are all
// born in the 2000s+, so YY <= (current 2-digit year + 1) means 20YY, else
// 19YY. Confirmed against a real Open Men's PDF (Sumit Nagal, "16-Aug-97" =
// 1997, correctly resolved as 19xx since 97 > current-year-cutoff).
export function parseDob(raw) {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const mon = months[m[2].toLowerCase()];
  if (!mon) return null;
  const yy = parseInt(m[3], 10);
  const currentYY = new Date().getFullYear() % 100;
  const year = yy <= currentYY + 1 ? 2000 + yy : 1900 + yy;
  return `${year}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function parseJuniorRankingPdfText(fullText) {
  const rows = [];
  let rowOrder = 0;
  for (const m of fullText.matchAll(JUNIOR_ROW_RE)) {
    const nums = m[6].split('|').map(s => s.trim()).filter(Boolean).map(Number);
    if (nums.length < 2) continue; // sanity guard — every known format has at least cut+final
    rowOrder++;
    const totalPoints = nums[nums.length - 1];
    rows.push({
      rowOrder,
      rank: parseInt(m[1], 10),
      playerName: m[2].trim(),
      regNo: m[3],
      dob: parseDob(m[4]),
      state: m[5],
      pointsBreakdown: buildPointsBreakdown(nums.slice(0, -1)),
      totalPoints,
    });
  }
  return rows;
}

// Be a polite scraper: fixed delay between requests to AITA's server.
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
