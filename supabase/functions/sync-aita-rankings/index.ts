// Incrementally syncs public.aita_rankings with new dates published at
// https://aitatennis.com/playerranking/, for the 8 Junior combos backfilled
// in Phases 1-2 (Boys/Girls U-12/14/16/18). See AITA_RANKINGS_PLAN.md Phase 6.
//
// Unlike sync-aita-calendar, ranking snapshots are immutable once published —
// a past ranking_date's data never changes — so this only ever needs to
// detect *new* dates per combo, never re-check existing ones. That's tracked
// in aita_rankings_sync_state (one row per combo, storing the newest
// ranking_date already synced) instead of paging the whole table every run,
// which would blow the execution budget once a combo has 100k+ rows.
//
// Deploy: supabase functions deploy sync-aita-rankings
// No new secret needed — `supabase secrets set` is project-wide, so the
// SYNC_SECRET already configured for sync-aita-calendar is automatically
// available here too via Deno.env.get('SYNC_SECRET').
// Then run supabase/phase28_aita_rankings_sync.sql (tables + weekly cron).
//
// Two allowed callers (same pattern as sync-aita-calendar):
//   - pg_cron, via header x-sync-secret: <SYNC_SECRET>.
//   - a "Sync Now" button, via a normal user JWT — caller's
//     user_profiles.role must be 'organizer'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// unpdf ships a serverless PDF.js build with no DOM dependency (pdfjs-dist
// itself references DOMMatrix, which doesn't exist in Deno's edge runtime —
// see sync-aita-calendar for the same issue). Its getDocumentProxy() returns
// a real pdfjs-dist PDFDocumentProxy, so the low-level getPage()/
// getTextContent() API used below works identically to the Node backfill
// script (scripts/aita-rankings/lib.mjs) — confirmed directly against a live
// ranking PDF before writing this. That parity matters: the existing
// JUNIOR_ROW_RE regex is built around each PDF text item becoming its own
// pipe-delimited token (content.items.map(it => it.str).join('|')), which is
// NOT what unpdf's higher-level extractText() helper produces (that returns
// merged, space/newline-joined text, which sync-aita-calendar uses instead
// since its own parser is label-anchored substring search, not a regex table
// parser). Using extractText() here would silently parse 0 rows.
import { getDocumentProxy } from 'npm:unpdf@1.8.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');

const BASE = 'https://aitatennis.com';

// Only the Junior format-A combos backfilled so far (Phases 1-2). Extending
// to Open/Wheelchair/Seniors (Phases 3-5) means adding their combos here
// *and* a new parser branch for their PDF column layout — not needed yet.
const JUNIOR_COMBOS: [string, string][] = [
  ['Boys', 'U-12'], ['Boys', 'U-14'], ['Boys', 'U-16'], ['Boys', 'U-18'],
  ['Girls', 'U-12'], ['Girls', 'U-14'], ['Girls', 'U-16'], ['Girls', 'U-18'],
];

// Global cap on the expensive part (PDF fetch+parse+upsert) per invocation.
// The cheap part (checking each combo's live date list for anything new) is
// NOT capped — it's just 3 lightweight HTML fetches per combo (24 total for
// all 8), fast enough to do in full every run. At a weekly cron cadence the
// steady-state case is 0-1 new date per combo, so 8 fully covers a normal
// week; a missed cycle or first run just spreads the backlog across a
// couple of cron cycles instead of risking a timeout in one.
const MAX_PDF_PARSES_PER_RUN = 8;

// Be a polite scraper: same fixed delay between requests as the local
// backfill scripts use against AITA's server.
const REQUEST_DELAY_MS = 1200;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

// ---------------------------------------------------------------------------
// Site mechanics — ported unchanged from scripts/aita-rankings/lib.mjs
// (session-cookie AJAX dance for discovery, stateless GET for the PDF link;
// see AITA_RANKINGS_PLAN.md section 2 for the reverse-engineered mechanics).
// ---------------------------------------------------------------------------

async function get(url: string, cookie?: string): Promise<{ text: string; cookie?: string }> {
  const res = await fetch(url, { headers: cookie ? { cookie } : {} });
  const setCookie = res.headers.get('set-cookie');
  const newCookie = setCookie ? setCookie.split(';')[0] : cookie;
  const text = await res.text();
  return { text, cookie: newCookie };
}

async function listDatesFor(category: string, subcategory: string): Promise<string[]> {
  let cookie: string | undefined = '';
  ({ cookie } = await get(`${BASE}/playerranking/`, cookie));
  ({ cookie } = await get(`${BASE}/management/ajax/ranking.php?q=${encodeURIComponent(category)}`, cookie));
  const { text } = await get(`${BASE}/management/ajax/ranking2.php?q=${encodeURIComponent(subcategory)}`, cookie);
  return [...text.matchAll(/<option value="([\d-]+)">/g)].map((m) => m[1]);
}

async function pdfUrlFor(category: string, subcategory: string, date: string): Promise<{ pdfUrl: string | null; sourceUrl: string }> {
  const url = `${BASE}/rankingresult/?cat=${encodeURIComponent(category)}&subcat=${encodeURIComponent(subcategory)}&date1=${date}`;
  const { text } = await get(url);
  const m = text.match(/href="([^"]*management\/upload\/ranking\/[^"]+\.pdf)"/i);
  if (!m) return { pdfUrl: null, sourceUrl: url };
  return { pdfUrl: new URL(m[1], `${BASE}/rankingresult/`).toString(), sourceUrl: url };
}

async function extractPdfText(pdfUrl: string): Promise<string> {
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // deliberately untyped: unpdf's TextContent item type isn't verified
    // against pdfjs-dist's here (no Deno available in this sandbox to
    // `deno check` it), so avoid risking a deploy-time structural mismatch.
    const content: any = await page.getTextContent();
    fullText += content.items.map((it: any) => it.str).join('|') + '|';
  }
  return fullText;
}

// ---------------------------------------------------------------------------
// Junior-format parser — ported from lib.mjs (see AITA_RANKINGS_PLAN.md
// section 4 for other category types' layouts, not needed until Phase 3-5).
//
// AITA's column count is NOT fixed at 5 numeric columns. Confirmed live
// 2026-07-26 across each combo's full history: some categories/date-ranges
// insert an extra "bonus points" column (e.g. "Asian U-14/16", "25% PTS.")
// between LATE WL and the real Final total, and Boys/Girls U-18 use a
// 7-numeric-column layout with yet another order (X 2/MENS/WOMEN'S columns,
// LATE WL moved near the end). The one invariant across every format seen:
// the real Final/TTL total is always the LAST numeric column before the
// next row starts. So instead of a fixed count, lazily consume numeric
// columns until a lookahead confirms the next row's rank+name is starting
// (or end of text) — the last number captured is always total_points.
// ---------------------------------------------------------------------------

const JUNIOR_ROW_RE = /(\d+)\|\s*\|([A-Z][A-Z .'-]*?)\|\s*\|(\d+)\|\s*\|(\d{1,2}-[A-Za-z]{3}-\d{2})\|\s*\|\(([A-Z]{2})\)\|\s*\|((?:[\d.]+\|(?:\s*\|)?)+?)(?=\d+\|\s*\|[A-Z]|$)/g;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDob(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  const yy = parseInt(m[3], 10);
  const currentYY = new Date().getFullYear() % 100;
  const year = yy <= currentYY + 1 ? 2000 + yy : 1900 + yy;
  return `${year}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

interface JuniorRow {
  rowOrder: number;
  rank: number;
  playerName: string;
  regNo: string;
  dob: string | null;
  state: string;
  pointsBreakdown: Record<string, number>;
  totalPoints: number;
}

// Maps the numeric columns preceding the real total onto named fields when
// the layout is one we recognize (so the rankings-table UI's Singles/
// Doubles/25% Best Dbls columns keep working); anything else (currently:
// Boys/Girls U-18's 6-preceding-column layout, which reorders LATE WL and
// adds differently-named bonus columns) is kept positionally.
function buildPointsBreakdown(nums: number[]): Record<string, number> {
  if (nums.length === 4) {
    const [singlesPts, doublesPts, best25DoublesPts, cutPts] = nums;
    return { singlesPts, doublesPts, best25DoublesPts, cutPts };
  }
  if (nums.length === 5) {
    const [singlesPts, doublesPts, best25DoublesPts, cutPts, bonusPts] = nums;
    return { singlesPts, doublesPts, best25DoublesPts, cutPts, bonusPts };
  }
  const breakdown: Record<string, number> = {};
  nums.forEach((v, i) => { breakdown[`col${i + 1}`] = v; });
  return breakdown;
}

function parseJuniorRankingPdfText(fullText: string): JuniorRow[] {
  const rows: JuniorRow[] = [];
  let rowOrder = 0;
  for (const m of fullText.matchAll(JUNIOR_ROW_RE)) {
    const nums = m[6].split('|').map((s) => s.trim()).filter(Boolean).map(Number);
    if (nums.length < 2) continue;
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Auth: cron secret OR organizer JWT (same as sync-aita-calendar) ---
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

  const { data: stateRows } = await admin.from('aita_rankings_sync_state').select('*');
  const stateByCombo = new Map((stateRows || []).map((r) => [`${r.category}|${r.subcategory}`, r]));

  const { data: skipRows } = await admin.from('aita_rankings_skip_dates').select('*');
  const skipByCombo = new Map<string, Set<string>>();
  for (const r of skipRows || []) {
    const key = `${r.category}|${r.subcategory}`;
    if (!skipByCombo.has(key)) skipByCombo.set(key, new Set());
    skipByCombo.get(key)!.add(r.bad_date);
  }

  let pdfParses = 0;
  const summary: Array<Record<string, unknown>> = [];

  for (const [category, subcategory] of JUNIOR_COMBOS) {
    const key = `${category}|${subcategory}`;
    const state = stateByCombo.get(key);
    const lastSynced: string | null = state?.last_synced_date ?? null;
    const skipSet = skipByCombo.get(key) ?? new Set<string>();
    const startedAt = new Date().toISOString();

    let datesUpserted = 0;
    let rowsUpserted = 0;
    let newHighWaterMark = lastSynced;
    let liveDateCount = 0;
    let comboError: string | null = null;

    try {
      const liveDates = await listDatesFor(category, subcategory);
      liveDateCount = liveDates.length;

      // Oldest-first, so the high-water mark advances monotonically even if
      // MAX_PDF_PARSES_PER_RUN is hit partway through a catch-up.
      const newDates = liveDates
        .filter((d) => (!lastSynced || d > lastSynced) && !skipSet.has(d))
        .sort();

      for (const date of newDates) {
        if (pdfParses >= MAX_PDF_PARSES_PER_RUN) break;
        pdfParses++;

        const { pdfUrl, sourceUrl } = await pdfUrlFor(category, subcategory, date);
        if (!pdfUrl) { await sleep(REQUEST_DELAY_MS); continue; }

        const text = await extractPdfText(pdfUrl);
        const rows = parseJuniorRankingPdfText(text);
        if (rows.length === 0) {
          // Format mismatch or a parse hiccup — don't advance the high-water
          // mark past a date we never actually got data for.
          await sleep(REQUEST_DELAY_MS);
          continue;
        }

        const dbRows = rows.map((r) => ({
          category, subcategory, ranking_date: date,
          row_order: r.rowOrder, rank: r.rank, player_name: r.playerName,
          reg_no: r.regNo || null, dob: r.dob, state: r.state,
          total_points: r.totalPoints, points_breakdown: r.pointsBreakdown,
          pdf_url: pdfUrl, source_url: sourceUrl,
        }));

        const { error: upsertErr } = await admin
          .from('aita_rankings')
          .upsert(dbRows, { onConflict: 'category,subcategory,ranking_date,row_order' });
        if (upsertErr) throw new Error(upsertErr.message);

        datesUpserted++;
        rowsUpserted += dbRows.length;
        newHighWaterMark = date;
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      comboError = String(err);
    }

    await admin.from('aita_rankings_sync_state').upsert({
      category, subcategory,
      last_synced_date: newHighWaterMark,
      last_checked_at: new Date().toISOString(),
      last_error: comboError,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'category,subcategory' });

    await admin.from('aita_rankings_sync_log').insert({
      category, subcategory,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      dates_found: liveDateCount,
      dates_upserted: datesUpserted,
      rows_upserted: rowsUpserted,
      error: comboError,
      triggered_by: triggeredBy,
    });

    summary.push({ category, subcategory, datesUpserted, rowsUpserted, error: comboError });
  }

  return new Response(JSON.stringify({ summary, pdfParses }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
