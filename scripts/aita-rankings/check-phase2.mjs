import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

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

const PAGE = 1000;

async function checkCombo(category, subcategory) {
  const dates = new Set();
  let total = null;
  let from = 0;
  for (;;) {
    const { data, error, count } = await supabase
      .from('aita_rankings')
      .select('ranking_date', { count: from === 0 ? 'exact' : undefined })
      .eq('category', category)
      .eq('subcategory', subcategory)
      .order('ranking_date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return `${category} ${subcategory}: ERROR ${error.message}`;
    }
    if (from === 0) total = count;
    for (const r of data) dates.add(r.ranking_date);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  const sorted = [...dates].sort();
  return `${category} ${subcategory}: ${total} rows, ${dates.size} distinct dates, range ${sorted[0] || 'none'} .. ${sorted[sorted.length - 1] || 'none'}`;
}

const results = await Promise.all(combos.map(([c, s]) => checkCombo(c, s)));
for (const line of results) console.log(line);
