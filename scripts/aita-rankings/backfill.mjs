// Backfills aita_rankings for ONE category+subcategory combo, all published
// dates. Rate-limited and resumable (skips dates already in the DB).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/aita-rankings/backfill.mjs Girls U-12
//
// Needs VITE_SUPABASE_URL (already in .env) and SUPABASE_SERVICE_ROLE_KEY
// (NOT committed — export it in your shell or add it to the gitignored
// .env; this script reads both from .env plus the shell environment).
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { listDatesFor, pdfUrlFor, extractPdfText, parseJuniorRankingPdfText, sleep } from './lib.mjs';

// Minimal .env loader (no dotenv dependency in this project) — shell env
// still wins over anything in .env.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}

const REQUEST_DELAY_MS = 1200; // be polite to AITA's server

const [category, subcategory] = process.argv.slice(2);
if (!category || !subcategory) {
  console.error('Usage: node scripts/aita-rankings/backfill.mjs <Category> <SubCategory>');
  console.error('Example: node scripts/aita-rankings/backfill.mjs Girls U-12');
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

async function alreadySyncedDates() {
  // Supabase/PostgREST caps each response at 1000 rows, and a fully-backfilled
  // combo can have hundreds of thousands of rows — must paginate or this only
  // "sees" the first ~1000 rows' worth of dates and wrongly re-fetches the rest.
  const PAGE = 1000;
  const dates = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('aita_rankings')
      .select('ranking_date')
      .eq('category', category)
      .eq('subcategory', subcategory)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Checking existing dates failed: ${error.message}`);
    for (const r of data) dates.add(r.ranking_date);
    if (!data || data.length < PAGE) break;
  }
  return dates;
}

function toDbRow(row, pdfUrl, sourceUrl) {
  return {
    category,
    subcategory,
    ranking_date: null, // filled in by caller per-date
    row_order: row.rowOrder,
    rank: row.rank,
    player_name: row.playerName,
    reg_no: row.regNo || null,
    dob: row.dob,
    state: row.state,
    total_points: row.totalPoints,
    points_breakdown: row.pointsBreakdown,
    pdf_url: pdfUrl,
    source_url: sourceUrl,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`\n=== Backfilling ${category} / ${subcategory} ===`);

  const allDates = await listDatesFor(category, subcategory);
  console.log(`Found ${allDates.length} published dates.`);

  const existing = await alreadySyncedDates();
  const todo = allDates.filter(d => !existing.has(d));
  console.log(`${existing.size} already synced, ${todo.length} to fetch.`);

  let datesUpserted = 0;
  let rowsUpserted = 0;
  let errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const date = todo[i];
    process.stdout.write(`[${i + 1}/${todo.length}] ${date} ... `);
    try {
      const { pdfUrl, sourceUrl } = await pdfUrlFor(category, subcategory, date);
      if (!pdfUrl) {
        console.log('no PDF link found, skipping');
        continue;
      }
      const text = await extractPdfText(pdfUrl);
      const rows = parseJuniorRankingPdfText(text);
      if (rows.length === 0) {
        console.log('parsed 0 rows, skipping (format mismatch?)');
        errors++;
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const dbRows = rows.map(r => ({ ...toDbRow(r, pdfUrl, sourceUrl), ranking_date: date }));
      const { error: upsertErr } = await supabase
        .from('aita_rankings')
        .upsert(dbRows, { onConflict: 'category,subcategory,ranking_date,row_order' });
      if (upsertErr) throw new Error(upsertErr.message);
      datesUpserted++;
      rowsUpserted += dbRows.length;
      console.log(`${dbRows.length} rows`);
    } catch (err) {
      errors++;
      console.log(`ERROR: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  await supabase.from('aita_rankings_sync_log').insert({
    category,
    subcategory,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dates_found: allDates.length,
    dates_upserted: datesUpserted,
    rows_upserted: rowsUpserted,
    error: errors > 0 ? `${errors} date(s) failed — see console log` : null,
    triggered_by: 'backfill:scripts/aita-rankings/backfill.mjs',
  });

  console.log(`\nDone. ${datesUpserted}/${todo.length} new dates synced, ${rowsUpserted} rows upserted, ${errors} errors.`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
