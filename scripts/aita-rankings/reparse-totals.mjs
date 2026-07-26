// One-time repair: re-fetches every already-stored PDF for a combo (using
// the pdf_url already saved from the original backfill — no need to
// re-navigate AITA's cookie-dance site mechanics) and re-parses with the
// fixed column-agnostic parser, upserting corrected total_points/
// points_breakdown in place via the same natural-key conflict target.
//
// Usage: node scripts/aita-rankings/reparse-totals.mjs <Category> <SubCategory> [--since=YYYY-MM-DD]
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { extractPdfText, parseJuniorRankingPdfText } from './lib.mjs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}

const REQUEST_DELAY_MS = 1200;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const [category, subcategory, ...rest] = process.argv.slice(2);
const sinceArg = rest.find(a => a.startsWith('--since='));
const since = sinceArg ? sinceArg.split('=')[1] : null;

if (!category || !subcategory) {
  console.error('Usage: node scripts/aita-rankings/reparse-totals.mjs <Category> <SubCategory> [--since=YYYY-MM-DD]');
  process.exit(1);
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  let query = supabase
    .from('aita_rankings')
    .select('ranking_date, pdf_url, source_url')
    .eq('category', category).eq('subcategory', subcategory).eq('row_order', 1)
    .order('ranking_date', { ascending: true });
  if (since) query = query.gte('ranking_date', since);
  const { data: dates, error } = await query;
  if (error) throw new Error(error.message);

  console.log(`\n=== Re-parsing ${category} / ${subcategory} — ${dates.length} dates${since ? ` (since ${since})` : ''} ===`);

  let ok = 0, failed = 0, rowsUpdated = 0;
  for (let i = 0; i < dates.length; i++) {
    const { ranking_date, pdf_url, source_url } = dates[i];
    process.stdout.write(`[${i + 1}/${dates.length}] ${ranking_date} ... `);
    try {
      const text = await extractPdfText(pdf_url);
      const rows = parseJuniorRankingPdfText(text);
      if (rows.length === 0) {
        console.log('parsed 0 rows, skipping');
        failed++;
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      const dbRows = rows.map(r => ({
        category, subcategory, ranking_date,
        row_order: r.rowOrder, rank: r.rank, player_name: r.playerName,
        reg_no: r.regNo || null, dob: r.dob, state: r.state,
        total_points: r.totalPoints, points_breakdown: r.pointsBreakdown,
        pdf_url, source_url,
      }));
      // Retry transient DB contention (statement timeouts) a few times before
      // giving up on a date — cheap since upsert is idempotent either way.
      let upsertErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        ({ error: upsertErr } = await supabase
          .from('aita_rankings')
          .upsert(dbRows, { onConflict: 'category,subcategory,ranking_date,row_order' }));
        if (!upsertErr) break;
        if (attempt < 4) await sleep(attempt * 3000);
      }
      if (upsertErr) throw new Error(upsertErr.message);
      ok++;
      rowsUpdated += dbRows.length;
      console.log(`${dbRows.length} rows`);
    } catch (err) {
      failed++;
      console.log(`ERROR: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  console.log(`\nDone. ${ok}/${dates.length} dates re-parsed, ${rowsUpdated} rows updated, ${failed} failed.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
