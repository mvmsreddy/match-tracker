/**
 * AITA Draw Sheet PDF parser.
 * Extracts per-position entries (position, status, rank, seed, name, AITA
 * reg, state) from a real AITA draw sheet PDF (Main or Qualifying), plus
 * best-effort header metadata (draw type, category, age group) for
 * confirmation before publishing.
 *
 * The PDF's "St. Rank Seed" cell is actually ONE right-justified numeric
 * run per row — when a player is unseeded it prints just the rank, right up
 * against the same right edge the seed number would otherwise occupy, so a
 * fixed x-coordinate can't tell rank and seed apart. What's reliable
 * instead: token ORDER. Working backward from the AITA-reg cell (the only
 * token shaped like "XX 123456") pins down family name and first name;
 * everything left of that between the position number and family name is
 * then classified by shape — letters-only (max 4 chars) is the status code,
 * numbers are rank (first) then seed (second, if present). Verified against
 * two real AITA NS U14 draw sheets (Hyderabad, Aug 2026).
 */
import * as pdfjsLib from 'pdfjs-dist';

// Vite-compatible worker URL — same setup as parseFactsheet.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ---------------------------------------------------------------------------
// Pure parsing — operates on a flat list of {str, x, y} text items (already
// extracted from the PDF by the caller). Works the same whether the items
// came from pdfjs-dist in the browser or its Node/legacy build.
// ---------------------------------------------------------------------------

const Y_TOLERANCE = 3;
const REG_RE = /^[A-Z]{2}\s+\d{4,7}$/;
const STATUS_RE = /^[A-Z]{1,4}$/;
// "DA" (Direct Acceptance) is AITA's default/normal entry — the app only
// tracks the exception codes, so DA maps to '' same as a blank status cell.
const STATUS_CODE_MAP = { DA: '' };

function groupRows(items) {
  const meaningful = items.filter(it => it.str && it.str.trim() !== '');
  const sorted = [...meaningful].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  let current = [];
  let rowY = null;
  for (const it of sorted) {
    if (rowY === null || Math.abs(it.y - rowY) <= Y_TOLERANCE) {
      current.push(it);
      if (rowY === null) rowY = it.y;
    } else {
      rows.push(current);
      current = [it];
      rowY = it.y;
    }
  }
  if (current.length) rows.push(current);
  return rows.map(r => r.sort((a, b) => a.x - b.x).map(i => i.str.trim()));
}

function parseEntryRows(rows) {
  const entries = [];
  const errors = [];

  let idx = rows.findIndex(r => r[0] === '1');
  if (idx === -1) return { entries, errors: ['Could not find the start of the draw table (row "1").'] };

  let expectedPos = 1;
  for (; idx < rows.length; idx++) {
    const row = rows[idx];
    if (row[0] !== String(expectedPos)) break;
    const position = expectedPos;
    expectedPos++;

    if (row[1] === 'BYE') {
      entries.push({
        position, isBye: true, familyName: 'BYE', firstName: '',
        seed: null, aitaReg: null, playerState: null, ranking: null, statusCode: '',
      });
      continue;
    }

    const regIdx = row.findIndex((t, i) => i >= 1 && REG_RE.test(t));
    if (regIdx === -1 || regIdx < 3) {
      errors.push(`Position ${position}: could not locate the AITA reg/state cell in row [${row.join(' | ')}]`);
      continue;
    }

    const firstName = row[regIdx - 1];
    const familyName = row[regIdx - 2];
    const [playerState, aitaReg] = row[regIdx].split(/\s+/);

    const between = row.slice(1, regIdx - 2);
    const nums = between.filter(t => /^\d+$/.test(t));
    const statusRaw = between.find(t => STATUS_RE.test(t));

    entries.push({
      position,
      isBye: false,
      familyName,
      firstName,
      aitaReg,
      playerState,
      ranking: nums[0] ? Number(nums[0]) : null,
      seed: nums[1] ? Number(nums[1]) : null,
      statusCode: statusRaw ? (STATUS_CODE_MAP[statusRaw] ?? statusRaw) : '',
    });
  }

  return { entries, errors };
}

function parseMeta(items) {
  const allText = items.map(i => i.str).join(' ').replace(/\s+/g, ' ');

  const drawMatch = allText.match(/\b(BOYS|GIRLS|MENS|MEN'S|WOMENS|WOMEN'S)\s+(SINGLES|DOUBLES)\s+(MAIN|QUALIFYING)\s+DRAW\b/i);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const category = drawMatch ? `${cap(drawMatch[1].replace(/'S$/i, ''))} ${cap(drawMatch[2])}` : null;
  const drawType = drawMatch ? (drawMatch[3].toUpperCase() === 'MAIN' ? 'main' : 'qualifying') : null;

  const ageMatch = allText.match(/\bU-?\s?(\d{1,2})\b/i) || allText.match(/\bUnder\s+(\d{1,2})\b/i);
  const ageGroup = ageMatch ? `U${ageMatch[1]}` : null;

  // Two rows can match the "City, State" shape: the column-header row itself
  // (literal text "City, State") and, right below it, the actual value row
  // (e.g. "Hyderabad, Telangana") — skip the literal header label.
  const isCityShaped = t => /^[A-Za-z .]+,\s*[A-Za-z .]+$/.test(t) && t !== 'City, State';
  const cityRow = groupRows(items).find(r => r.some(isCityShaped));
  const cityToken = cityRow?.find(isCityShaped) || null;
  const referee = cityRow ? cityRow[cityRow.length - 1] : null;

  const titleItem = items.find(it => /^AITA\b/i.test(it.str.trim()));

  return {
    drawType,
    category,
    ageGroup,
    city: cityToken,
    referee: referee && referee !== cityToken ? referee : null,
    tournamentTitle: titleItem ? titleItem.str.trim() : null,
  };
}

/**
 * @param {Array<{str: string, x: number, y: number}>} items  Text items for
 *   ALL pages of the draw sheet, in any order (grouping/sorting happens
 *   here). A multi-page draw simply concatenates every page's items.
 */
export function parseDrawSheetItems(items) {
  const rows = groupRows(items);
  const { entries, errors } = parseEntryRows(rows);
  const meta = parseMeta(items);
  const numSeeds = entries.filter(e => e.seed).length;
  return { meta, entries, errors, drawSize: entries.length, numSeeds };
}

// ---------------------------------------------------------------------------
// Browser entry point — mirrors parseFactsheet.js's pdfjs-dist setup.
// ---------------------------------------------------------------------------
export async function parseDrawSheetPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
  }
  return parseDrawSheetItems(items);
}
