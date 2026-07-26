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

const combos = [
  ['Boys', 'U-12'], ['Boys', 'U-14'], ['Boys', 'U-16'], ['Boys', 'U-18'],
  ['Girls', 'U-12'], ['Girls', 'U-14'], ['Girls', 'U-16'], ['Girls', 'U-18'],
];

async function getSampleDates(category, subcategory) {
  const { data } = await supabase
    .from('aita_rankings')
    .select('ranking_date, pdf_url')
    .eq('category', category).eq('subcategory', subcategory).eq('row_order', 1)
    .order('ranking_date', { ascending: true });
  if (!data || data.length === 0) return [];
  const n = data.length;
  const idxs = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
  const seen = new Set();
  const out = [];
  for (const i of idxs) {
    const row = data[i];
    if (!seen.has(row.ranking_date)) { seen.add(row.ranking_date); out.push(row); }
  }
  return out;
}

const argCombo = process.argv[2]; // optional: restrict to e.g. "Boys/U-16"
for (const [category, subcategory] of combos) {
  if (argCombo && `${category}/${subcategory}` !== argCombo) continue;
  console.log(`\n===== ${category} ${subcategory} =====`);
  const samples = await getSampleDates(category, subcategory);
  for (const { ranking_date, pdf_url } of samples) {
    try {
      const text = await extractPdfText(pdf_url);
      const headerIdx = text.search(/RANK|RANKING/);
      const header = text.slice(headerIdx, headerIdx + 260).replace(/\|/g, ' ¦ ');
      console.log(`--- ${ranking_date} (${pdf_url.split('/').pop()}) ---`);
      console.log(header);
    } catch (e) {
      console.log(`--- ${ranking_date} --- ERROR: ${e.message}`);
    }
  }
}
