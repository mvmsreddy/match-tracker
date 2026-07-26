// One-off: backfill a single specific date for a combo, bypassing listDatesFor.
// Needed when AITA's own date-list has a duplicate/bogus entry for the same
// underlying PDF (see AITA_RANKINGS_PLAN.md, Girls U-14 20214-05-13 case) —
// running the normal backfill.mjs would re-fetch the bogus duplicate too.
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { pdfUrlFor, extractPdfText, parseJuniorRankingPdfText } from './lib.mjs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}

const [category, subcategory, date] = process.argv.slice(2);
if (!category || !subcategory || !date) {
  console.error('Usage: node scripts/aita-rankings/backfill-one-date.mjs <Category> <SubCategory> <YYYY-MM-DD>');
  process.exit(1);
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { pdfUrl, sourceUrl } = await pdfUrlFor(category, subcategory, date);
if (!pdfUrl) {
  console.error('No PDF link found for this date.');
  process.exit(1);
}
console.log('pdfUrl:', pdfUrl);
const text = await extractPdfText(pdfUrl);
const rows = parseJuniorRankingPdfText(text);
console.log(`parsed ${rows.length} rows`);
if (rows.length === 0) process.exit(1);

const dbRows = rows.map(r => ({
  category, subcategory, ranking_date: date,
  row_order: r.rowOrder, rank: r.rank, player_name: r.playerName,
  reg_no: r.regNo || null, dob: r.dob, state: r.state,
  total_points: r.totalPoints, points_breakdown: r.pointsBreakdown,
  pdf_url: pdfUrl, source_url: sourceUrl,
}));

const { error } = await supabase.from('aita_rankings')
  .upsert(dbRows, { onConflict: 'category,subcategory,ranking_date,row_order' });
if (error) throw new Error(error.message);
console.log(`upserted ${dbRows.length} rows for ${category} ${subcategory} ${date}`);
