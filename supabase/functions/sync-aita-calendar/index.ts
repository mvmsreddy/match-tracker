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
// pdfjs-dist (even its "legacy" build) references DOMMatrix, which doesn't
// exist in Deno's edge runtime (`ReferenceError: DOMMatrix is not defined`,
// confirmed against the deployed function's logs). unpdf ships a serverless
// build of PDF.js with the worker inlined and no DOM dependency — built
// specifically for edge runtimes (Cloudflare Workers, Deno).
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');

const AITA_BASE = 'https://aitatennis.com/management/';
const BUCKET = 'aita-factsheets';

// Only sync tournaments in this window — keeps each run within the Edge
// Function's execution time budget. Long-past tournaments' fact sheets
// never change; far-future ones aren't on AITA's site yet anyway.
const PAST_WINDOW_DAYS = 30;

// A single invocation still hit WORKER_RESOURCE_LIMIT even capped at 12 PDF
// parses — the calendar can carry 100+ in-window tournaments, and doing that
// many sequential AITA fetches + Supabase round-trips in one invocation is
// itself enough to exceed the platform's per-invocation budget, independent
// of PDF parsing. So both are capped: total tournaments touched per run, and
// PDF downloads+parses (the more expensive subset) within that. Whatever's
// left over is picked up by the next run (every 6h via cron, or another
// manual "Sync Now") — entries are prioritized so new/stalest ones go first,
// so repeated runs make forward progress instead of reprocessing the same set.
const MAX_TOURNAMENTS_PER_RUN = 30;
const MAX_PDF_PARSES_PER_RUN = 5;

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

  // Not always h4s[1] — some pages insert extra city/state h4s between the
  // name and the venue (confirmed live: id=4970 has [name, city, state,
  // venue, category, ...], while others have just [name, venue, category,
  // ...]). The venue is reliably whatever comes right before "Category -".
  const categoryIndex = h4s.findIndex((h) => /Category\s*-/.test(h));
  const venue = categoryIndex > 0 ? stripTags(h4s[categoryIndex - 1]) : (h4s[1] ? stripTags(h4s[1]) : '');

  const categoryRaw = categoryIndex >= 0 ? h4s[categoryIndex] : '';
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
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(text) ? text.join('\n') : text;
  // unpdf preserves the PDF's real line breaks (e.g. "COURT\nSURFACE"), but
  // every label boundary below is a plain substring search assuming
  // space-joined text (same assumption as the working client-side parser in
  // src/utils/parseFactsheet.js, built against pdfjs getTextContent().join(' ')).
  // A label straddling a line break would otherwise never match its end
  // label, and between() would run all the way to the end of the document —
  // confirmed live: venue_phone ended up containing the entire rest of a
  // factsheet because "COURT SURFACE" was actually "COURT\nSURFACE".
  return raw.replace(/\s+/g, ' ').trim();
}

// A label's value is never a full-page dump. When the end label can't be
// found (e.g. a PDF layout quirk), between() used to silently run to the end
// of the document — confirmed live: this once dumped an entire factsheet's
// remaining text into venue_phone. Cap it instead.
const MAX_VALUE_LEN = 300;

function between(text: string, startLabel: string, endLabel: string, occurrence = 1): string {
  let from = 0;
  let si = -1;
  for (let n = 0; n < occurrence; n++) {
    si = text.indexOf(startLabel, from);
    if (si === -1) return '';
    from = si + startLabel.length;
  }
  const valueStart = si + startLabel.length;
  if (!endLabel) return text.slice(valueStart).replace(/\s+/g, ' ').trim();
  const found = text.indexOf(endLabel, valueStart);
  const ei = found === -1 ? Math.min(valueStart + MAX_VALUE_LEN, text.length) : found;
  return text.slice(valueStart, ei).replace(/\s+/g, ' ').trim();
}

/** Like between(), but matches whichever of several possible end labels appears first. */
function betweenAny(text: string, startLabel: string, endLabels: string[], occurrence = 1): string {
  let from = 0;
  let si = -1;
  for (let n = 0; n < occurrence; n++) {
    si = text.indexOf(startLabel, from);
    if (si === -1) return '';
    from = si + startLabel.length;
  }
  const valueStart = si + startLabel.length;
  let ei = -1;
  for (const label of endLabels) {
    const idx = text.indexOf(label, valueStart);
    if (idx !== -1 && (ei === -1 || idx < ei)) ei = idx;
  }
  if (ei === -1) ei = Math.min(valueStart + MAX_VALUE_LEN, text.length);
  return text.slice(valueStart, ei).replace(/\s+/g, ' ').trim();
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

  const venueAddress = betweenAny(text, 'ADDRESS OF THE VENUE', ['CITY', 'PINCODE', 'TELEPHONE NO.', 'COURT SURFACE']);
  const venuePincode = between(text, 'PINCODE', 'TELEPHONE NO.').replace(/\D/g, '');
  // 'TELEPHONE NO.' appears twice — once for the state association, once for
  // the venue. occurrence=2 lands on the venue's (the association's is
  // occurrence 1, already consumed as venuePincode's end label above).
  const venuePhone = between(text, 'TELEPHONE NO.', 'COURT SURFACE', 2);
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

// parseFactsheetText() returns '' for anything it couldn't find (convenient
// for string-building/hashing). But aita_tournaments has real date/integer
// columns — sending '' for those makes Postgres reject the whole upsert
// (confirmed via WORKER logs: upsertErr was silently ignored, so the row
// never actually saved and the same tournaments got retried every run).
// This maps the parsed fields onto DB-safe column values just before upsert.
const DATE_FIELDS = ['entryDeadline', 'withdrawalDeadline', 'qualifyingStartDate', 'qualifyingEndDate'] as const;
const INT_FIELDS = ['entryFeeSingles', 'entryFeeDoubles', 'dailyAllowance'] as const;

function factsheetFieldsToRow(fields: Partial<FactsheetFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DATE_FIELDS.includes(key as typeof DATE_FIELDS[number])) {
      row[camelToSnake(key)] = value ? value : null;
    } else if (INT_FIELDS.includes(key as typeof INT_FIELDS[number])) {
      const n = Number(value);
      row[camelToSnake(key)] = value && !Number.isNaN(n) ? n : null;
    } else if (value === '') {
      row[camelToSnake(key)] = null;
    } else {
      row[camelToSnake(key)] = value;
    }
  }
  return row;
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
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

  // One-off inspection route, gated by the same auth as everything else:
  // ?debugAitaId=<id> returns the stored row as-is, no crawling.
  const debugAitaId = new URL(req.url).searchParams.get('debugAitaId');
  if (debugAitaId) {
    const { data, error } = await admin
      .from('aita_tournaments')
      .select('*')
      .eq('aita_id', Number(debugAitaId))
      .maybeSingle();
    return new Response(JSON.stringify({ data, error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ?forceReparse=<id> clears that row's stored filename so the normal loop
  // below treats it as needing a fresh fetch+parse this run, regardless of
  // priority order or the past-window filter — for testing a single
  // tournament without waiting for AITA to publish a new file.
  const forceReparseId = new URL(req.url).searchParams.get('forceReparse');
  if (forceReparseId) {
    await admin.from('aita_tournaments').update({ factsheet_filename: null }).eq('aita_id', Number(forceReparseId));
  }

  // ?resetAll=true clears every row's stored filename, so subsequent runs
  // re-parse everyone with whatever the current parsing logic is — used
  // once after fixing a systemic extraction bug so already-synced rows get
  // backfilled with corrected data instead of sitting stale until AITA
  // happens to republish their fact sheet.
  if (new URL(req.url).searchParams.get('resetAll') === 'true') {
    await admin.from('aita_tournaments').update({ factsheet_filename: null }).not('factsheet_filename', 'is', null);
  }

  const { data: logRow } = await admin
    .from('aita_sync_log')
    .insert({ triggered_by: triggeredBy })
    .select('id')
    .single();
  const logId = logRow?.id;

  let found = 0, upserted = 0, changed = 0, pdfParses = 0;
  const sampleErrors: string[] = [];

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

    const inWindow = forceReparseId
      ? [...entries.values()].filter((e) => e.aitaId === Number(forceReparseId))
      : [...entries.values()].filter((e) => !e.startDate || e.startDate >= cutoffIso);

    // One batch query instead of one per tournament — just enough to prioritize.
    const { data: seenRows } = await admin
      .from('aita_tournaments')
      .select('aita_id, last_seen_at')
      .in('aita_id', inWindow.map((e) => e.aitaId));
    const lastSeenById = new Map((seenRows || []).map((r) => [r.aita_id, r.last_seen_at as string]));

    // New tournaments (never synced) first, then oldest-synced first, so a
    // run always makes forward progress instead of reprocessing the same slice.
    const prioritized = [...inWindow].sort((a, b) => {
      const aSeen = lastSeenById.get(a.aitaId);
      const bSeen = lastSeenById.get(b.aitaId);
      if (!aSeen && !bSeen) return 0;
      if (!aSeen) return -1;
      if (!bSeen) return 1;
      return aSeen < bSeen ? -1 : aSeen > bSeen ? 1 : 0;
    });
    const batch = prioritized.slice(0, MAX_TOURNAMENTS_PER_RUN);

    for (const entry of batch) {
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

        if (detail.factsheetUrl && pdfParses < MAX_PDF_PARSES_PER_RUN) {
          const newFilename = factsheetFilenameFromUrl(detail.factsheetUrl);
          if (newFilename !== existing?.factsheet_filename) {
            pdfParses++;
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
            } else if (sampleErrors.length < 3) {
              sampleErrors.push(`aita_id=${entry.aitaId}: pdf fetch failed, status=${pdfRes.status}`);
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
        Object.assign(row, factsheetFieldsToRow(factsheetFields));

        const { error: upsertErr } = await admin
          .from('aita_tournaments')
          .upsert(row, { onConflict: 'aita_id' });
        if (!upsertErr) {
          upserted++;
          if (rowChanged || !existing) changed++;
        } else if (sampleErrors.length < 3) {
          sampleErrors.push(`aita_id=${entry.aitaId}: upsert failed: ${upsertErr.message}`);
        }
      } catch (perTournamentErr) {
        console.error(`aita_id=${entry.aitaId} failed:`, perTournamentErr);
        if (sampleErrors.length < 3) sampleErrors.push(`aita_id=${entry.aitaId}: ${String(perTournamentErr)}`);
      }
    }

    await admin
      .from('aita_sync_log')
      .update({ finished_at: new Date().toISOString(), tournaments_found: found, tournaments_upserted: upserted, tournaments_changed: changed })
      .eq('id', logId);

    // sampleErrors surfaces up to 3 per-tournament failures directly in the
    // response, so problems are visible from the "Sync Now" result / a plain
    // curl call without a dashboard log round-trip.
    return new Response(JSON.stringify({ found, upserted, changed, pdfParses, sampleErrors }), {
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
