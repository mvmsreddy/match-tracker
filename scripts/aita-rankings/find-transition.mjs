import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { extractPdfText } from './lib.mjs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [category, subcategory] = process.argv.slice(2);

const { data } = await supabase
  .from('aita_rankings')
  .select('ranking_date, pdf_url')
  .eq('category', category).eq('subcategory', subcategory).eq('row_order', 1)
  .order('ranking_date', { ascending: true });

// isBroken(date): true if the PDF for this date has the extra bonus column
// (6 numeric cols instead of 5) — detected by checking whether the 5th
// numeric token after STATE is followed by a 6th before the next row starts.
async function numericColCount(pdfUrl) {
  const text = await extractPdfText(pdfUrl);
  const m = text.match(/\(([A-Z]{2})\)\|\s*\|((?:[\d.]+\|\s*\|){4,8})/);
  if (!m) return null;
  const nums = m[2].split('|').map(s => s.trim()).filter(s => s !== '' && /^[\d.]+$/.test(s));
  return nums.length;
}

let lo = 0, hi = data.length - 1;
const loCount = await numericColCount(data[lo].pdf_url);
const hiCount = await numericColCount(data[hi].pdf_url);
console.log(`${category} ${subcategory}: earliest ${data[lo].ranking_date} = ${loCount} numeric cols, latest ${data[hi].ranking_date} = ${hiCount} numeric cols`);

if (loCount === hiCount) {
  console.log('No transition in this date range — format is constant.');
  process.exit(0);
}

while (hi - lo > 1) {
  const mid = Math.floor((lo + hi) / 2);
  const count = await numericColCount(data[mid].pdf_url);
  console.log(`  checking ${data[mid].ranking_date} -> ${count} cols`);
  if (count === loCount) lo = mid; else hi = mid;
  await new Promise(r => setTimeout(r, 800));
}
console.log(`Transition: ${data[lo].ranking_date} (${loCount} cols, last clean) -> ${data[hi].ranking_date} (${hiCount} cols, first broken)`);
