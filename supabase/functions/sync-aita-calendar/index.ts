// Crawls the AITA tournament calendar (aitatennis.com) and mirrors it into
// public.aita_tournaments, re-hosting each tournament's fact sheet PDF in
// the `aita-factsheets` Storage bucket.
//
// Deploy: supabase functions deploy sync-aita-calendar
// Secret:  supabase secrets set SYNC_SECRET=<random value>
//          (same value used by the pg_cron job in phase25_aita_calendar.sql)
//
// Two allowed callers (checked below via x-sync-secret / Authorization):
//   - pg_cron, via header x-sync-secret: <SYNC_SECRET>. Its request also
//     carries `Authorization: Bearer <service-role key>` (set in the
//     cron.schedule call in phase25_aita_calendar.sql) purely so the
//     platform's JWT gateway lets the request through before this code
//     runs at all — x-sync-secret is the actual check performed here.
//   - the "Sync Now" button, via a normal user JWT (Authorization header,
//     attached automatically by supabase.functions.invoke) — the caller's
//     user_profiles.role must be 'organizer'.
//
// Runs with the service-role key (auto-injected by the Edge Runtime) so it
// can write to aita_tournaments / aita_sync_log / Storage, all of which
// deny writes to normal authenticated/anon roles via RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Legacy build: text extraction without DOM/canvas. Deno implements the Worker
// API (unlike Node, which pdfjs-dist falls back to a same-thread "fake worker"
// for), so a real worker source must be pointed at the matching npm module —
// otherwise getDocument() throws for lack of GlobalWorkerOptions.workerSrc.
import * as pdfjsLib from 'npm:pdfjs-dist@6.1.200/legacy/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'npm:pdfjs-dist@6.1.200/legacy/build/pdf.worker.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');

const AITA_BASE = 'https://aitatennis.com/management/';
const BUCKET = 'aita-factsheets';

// Only sync tournaments in this window — keeps each run within the Edge
// Function's execution time budget. Long-past tournaments' fact sheets
// never change; far-future ones aren't on AITA's site yet anyway.
const PAST_WINDOW_DAYS = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

// ---------------------------------------------------------------------------
// HTML parsing helpers (label-anchored string search, mirrors the style of
// src/utils/parseFactsheet.js — duplicated here since Deno can't import a
// Vite-bundled browser module).
// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "05,<br>Jan" + year 2026 -> "2026-01-05" */
function calendarCellToIso(cellHtml: string, year: number): string | null {
  const text = stripTags(cellHtml);
  const m = text.match(/(\d{1,2}),?\s*([A-Za-z]{3,})/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "05-01-2026" -> "2026-01-05" */
function ddmmyyyyToIso(raw: string): string | null {
  const m = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const CATEGORY_COLS: Record<number, string> = {
  1: 'Under 10', 2: 'Under 12', 3: 'Under 14', 4: 'Under 16', 5: 'Under 18',
  7: 'Men', 8: 'Women', 9: 'Senior',
};

interface CalendarEntry {
  aitaId: number;
  calendarName: string;
  ageGroup: string;
  startDate: string | null;
}

function parseCalendarHtml(html: string, year: number): Map<number, CalendarEntry> {
  const out = new Map<number, CalendarEntry>();
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html))) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(trMatch[1]))) cells.push(tdMatch[1]);
    if (cells.length < 10) continue;

    const startDate = calendarCellToIso(cells[0], year);

    for (const [idxStr, ageGroup] of Object.entries(CATEGORY_COLS)) {
      const idx = Number(idxStr);
      const cell = cells[idx];
      if (!cell) continue;
      const linkMatch = cell.match(/tournament-content\?id=(\d+)['"][^>]*>([^<]*)</);
      if (!linkMatch) continue;
      const aitaId = Number(linkMatch[1]);
      if (!out.has(aitaId)) {
        out.set(aitaId, { aitaId, calendarName: stripTags(linkMatch[2]), ageGroup, startDate });
      }
    }
  }
  return out;
}

interface DetailFields {
  name: string;
  venue: string;
  city: string;
  category: string;
  detailDate: string | null;
  factsheetUrl: string | null;
}

function parseDetailHtml(html: string): DetailFields {
  const afterH1 = html.slice(html.indexOf('</h1>'));
  const h4s = [...afterH1.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/g)].map((m) => m[1]);

  const name = h4s[0] ? stripTags(h4s[0]) : '';
  const venue = h4s[1] ? stripTags(h4s[1]) : '';

  const categoryRaw = h4s.find((h) => /Category\s*-/.test(h)) || '';
  const category = stripTags(categoryRaw).replace(/^Category\s*-\s*/i, '').trim();

  const dateRaw = h4s.find((h) => /^\s*Date\s*-/i.test(stripTags(h))) || '';
  const detailDate = ddmmyyyyToIso(stripTags(dateRaw));

  const downloadRaw = h4s.find((h) => /Download\s*-/.test(h) && /blob\.core\.windows\.net/.test(h));
  const factsheetMatch = downloadRaw?.match(/href="([^"]+)"/);
  const factsheetUrl = factsheetMatch ? factsheetMatch[1] : null;

  const cityMatch = name.match(/\(([^)]+)\)\s*$/);
  const city = cityMatch ? cityMatch[1].trim() : '';

  return { name, venue, city, category, detailDate, factsheetUrl };
}

// ---------------------------------------------------------------------------
// Fact sheet PDF parsing (ported from src/utils/parseFactsheet.js)
// ---------------------------------------------------------------------------

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  let full = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // deno-lint-ignore no-explicit-any
    full += content.items.map((i: any) => i.str).join(' ') + '\n';
  }
  return full;
}

function between(text: string, startLabel: string, endLabel: string, occurrence = 1): string {
  let from = 0;
  let si = -1;
  for (let n = 0; n < occurrence; n++) {
    si = text.indexOf(startLabel, from);
    if (si === -1) return '';
    from = si + startLabel.length;
  }
  const valueStart = si + startLabel.length;
  const ei = endLabel ? text.indexOf(endLabel, valueStart) : text.length;
  return text.slice(valueStart, ei === -1 ? undefined : ei).replace(/\s+/g, ' ').trim();
}

function toIso(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return '';
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return '';
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function normaliseSurface(raw: string): string {
  const MAP: Record<string, string> = { hard: 'Hard', clay: 'Clay', grass: 'Grass', carpet: 'Carpet', artificial: 'Artificial Grass' };
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(MAP)) if (lower.includes(key)) return val;
  return 'Hard';
}

function firstRupee(raw: string): string {
  const m = raw.match(/₹\s*([\d,]+)/);
  return m ? m[1].replace(/,/g, '') : '';
}

function secondRupee(raw: string): string {
  const matches = [...raw.matchAll(/₹\s*([\d,]+)/g)];
  return matches[1] ? matches[1][1].replace(/,/g, '') : '';
}

interface FactsheetFields {
  grade: string;
  entryDeadline: string;
  withdrawalDeadline: string;
  qualifyingStartDate: string;
  qualifyingEndDate: string;
  directorName: string;
  directorPhone: string;
  directorEmail: string;
  refereeName: string;
  refereePhone: string;
  refereeEmail: string;
  venueAddress: string;
  venuePincode: string;
  venuePhone: string;
  surface: string;
  ballBrand: string;
  hasFloodlights: boolean;
  entryFeeSingles: string;
  entryFeeDoubles: string;
  dailyAllowance: string;
  signinInstructions: string;
}

function parseFactsheetText(text: string): FactsheetFields {
  const grade = between(text, 'TOURNAMENT CATEGORY', 'AGE GROUP');

  const entryDeadline = toIso(between(text, 'ENTRY DEADLINE', 'WITHDRAWAL DEADLINE'));
  const withdrawalDeadline = toIso(between(text, 'WITHDRAWAL DEADLINE', 'DRAWS'));

  const qualBlock = between(text, 'SINGLES QUALIFYING', 'SINGLES MAIN');
  const allDatesInQual = [...qualBlock.matchAll(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/g)].map((m) => m[1]);
  const qualifyingStartDate = allDatesInQual[1] ? toIso(allDatesInQual[1]) : '';
  const qualifyingEndDate = allDatesInQual[2] ? toIso(allDatesInQual[2]) : '';

  const singlesQualSignIn = between(text, 'SINGLES QUALIFYING', 'SINGLES MAIN').match(/[\w\s,]+(?:from|till)\s[\d\w\s:]+(?:at\s\w+)?/i)?.[0] || '';
  const doublesSignIn = between(text, 'DOUBLES MAIN DRAW', 'VENUE DETAILS').match(/[\w\s,]+(?:from|till)\s[\d\w\s:]+(?:at\s\w+)?/i)?.[0] || '';
  const signinInstructions = [
    singlesQualSignIn ? `Qualifying sign-in: ${singlesQualSignIn.trim()}` : '',
    doublesSignIn ? `Doubles sign-in: ${doublesSignIn.trim()}` : '',
  ].filter(Boolean).join('\n');

  const venueAddress = between(text, 'ADDRESS OF THE VENUE', 'CITY');
  const venuePincode = between(text, 'PINCODE', 'TELEPHONE NO.').replace(/\D/g, '');
  const venuePhone = between(text, 'TELEPHONE NO.', 'COURT SURFACE');
  const surface = normaliseSurface(between(text, 'COURT SURFACE', 'BRAND OF BALLS'));
  const ballBrand = between(text, 'BRAND OF BALLS', 'NO. OF MATCH');
  const hasFloodlights = /yes/i.test(between(text, 'FLOODLIGHTS', 'TOURNAMENT OFFICIALS'));

  const directorName = between(text, 'TOURNAMENT DIRECTOR', 'MOBILE NO.');
  const directorPhone = between(text, 'MOBILE NO.', 'E-MAIL', 1);
  const directorEmail = between(text, 'E-MAIL', 'TOURNAMENT REFEREE', 1).match(/[\w._%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';

  const refereeName = between(text, 'TOURNAMENT REFEREE', 'MOBILE NO.');
  const refereePhone = between(text, 'MOBILE NO.', 'E-MAIL', 2);
  const refereeEmail = between(text, 'E-MAIL', 'HOTEL', 2).match(/[\w._%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';

  const feesBlock = between(text, 'ENTRY FEES', 'AGE ELIGIBILITY');
  const entryFeeSingles = firstRupee(feesBlock);
  const entryFeeDoubles = secondRupee(feesBlock);
  const dailyAllowance = firstRupee(between(text, 'DAILY ALLOWANCE', 'AITA Registration'));

  return {
    grade, entryDeadline, withdrawalDeadline, qualifyingStartDate, qualifyingEndDate,
    directorName, directorPhone, directorEmail, refereeName, refereePhone, refereeEmail,
    venueAddress, venuePincode, venuePhone, surface, ballBrand, hasFloodlights,
    entryFeeSingles, entryFeeDoubles, dailyAllowance, signinInstructions,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function factsheetFilenameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || url;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Auth: cron secret OR organizer JWT ---
  let triggeredBy = 'cron';
  const cronHeader = req.headers.get('x-sync-secret');
  if (SYNC_SECRET && cronHeader === SYNC_SECRET) {
    triggeredBy = 'cron';
  } else {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profile?.role !== 'organizer') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }
    triggeredBy = `manual:${userData.user.id}`;
  }

  const { data: logRow } = await admin
    .from('aita_sync_log')
    .insert({ triggered_by: triggeredBy })
    .select('id')
    .single();
  const logId = logRow?.id;

  let found = 0, upserted = 0, changed = 0;

  try {
    const year = new Date().getFullYear();
    const calendarRes = await fetch(`${AITA_BASE}calendar.php?year=${year}`);
    if (!calendarRes.ok) throw new Error(`calendar fetch failed: ${calendarRes.status}`);
    const calendarHtml = await calendarRes.text();
    const entries = parseCalendarHtml(calendarHtml, year);
    found = entries.size;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PAST_WINDOW_DAYS);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    for (const entry of entries.values()) {
      if (entry.startDate && entry.startDate < cutoffIso) continue;

      try {
        const { data: existing } = await admin
          .from('aita_tournaments')
          .select('factsheet_filename, content_hash')
          .eq('aita_id', entry.aitaId)
          .maybeSingle();

        const detailRes = await fetch(`${AITA_BASE}tournament-content?id=${entry.aitaId}`);
        if (!detailRes.ok) continue;
        const detailHtml = await detailRes.text();
        const detail = parseDetailHtml(detailHtml);

        let factsheetFields: Partial<FactsheetFields> = {};
        let factsheetFilename = existing?.factsheet_filename ?? null;
        let factsheetStoragePath: string | null = null;
        let contentHash = existing?.content_hash ?? null;
        let rowChanged = false;

        if (detail.factsheetUrl) {
          const newFilename = factsheetFilenameFromUrl(detail.factsheetUrl);
          if (newFilename !== existing?.factsheet_filename) {
            const pdfRes = await fetch(detail.factsheetUrl);
            if (pdfRes.ok) {
              const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
              const text = await extractPdfText(pdfBytes);
              factsheetFields = parseFactsheetText(text);

              const path = `${entry.aitaId}.pdf`;
              const { error: uploadErr } = await admin.storage
                .from(BUCKET)
                .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
              if (!uploadErr) factsheetStoragePath = path;

              const newHash = await sha256Hex(JSON.stringify(factsheetFields));
              rowChanged = newHash !== contentHash;
              contentHash = newHash;
              factsheetFilename = newFilename;
            }
          }
        }

        const grade = factsheetFields.grade || entry.calendarName.replace(/\s*\([^)]*\)\s*$/, '').trim();

        const row: Record<string, unknown> = {
          aita_id: entry.aitaId,
          name: detail.name || entry.calendarName,
          grade,
          age_group: entry.ageGroup,
          category: detail.category || entry.ageGroup,
          city: detail.city,
          venue: detail.venue,
          start_date: detail.detailDate || entry.startDate,
          source_url: `${AITA_BASE}tournament-content?id=${entry.aitaId}`,
          factsheet_source_url: detail.factsheetUrl,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (factsheetStoragePath) row.factsheet_storage_path = factsheetStoragePath;
        if (factsheetFilename) row.factsheet_filename = factsheetFilename;
        if (contentHash) row.content_hash = contentHash;
        if (rowChanged) row.last_changed_at = new Date().toISOString();
        Object.assign(row, factsheetFields);

        const { error: upsertErr } = await admin
          .from('aita_tournaments')
          .upsert(row, { onConflict: 'aita_id' });
        if (!upsertErr) {
          upserted++;
          if (rowChanged || !existing) changed++;
        }
      } catch (perTournamentErr) {
        console.error(`aita_id=${entry.aitaId} failed:`, perTournamentErr);
      }
    }

    await admin
      .from('aita_sync_log')
      .update({ finished_at: new Date().toISOString(), tournaments_found: found, tournaments_upserted: upserted, tournaments_changed: changed })
      .eq('id', logId);

    return new Response(JSON.stringify({ found, upserted, changed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await admin
      .from('aita_sync_log')
      .update({ finished_at: new Date().toISOString(), tournaments_found: found, tournaments_upserted: upserted, tournaments_changed: changed, error: String(err) })
      .eq('id', logId);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
