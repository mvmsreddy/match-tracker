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
  ['Girls', 'U-14'], ['Girls', 'U-16'], ['Girls', 'U-18'],
];

async function check(category, subcategory) {
  const { count: nullNames } = await supabase
    .from('aita_rankings')
    .select('*', { count: 'exact', head: true })
    .eq('category', category).eq('subcategory', subcategory)
    .is('player_name', null);

  // row_order gaplessness + count sanity on the most recent date only (cheap, representative)
  const { data: latest } = await supabase
    .from('aita_rankings')
    .select('ranking_date')
    .eq('category', category).eq('subcategory', subcategory)
    .order('ranking_date', { ascending: false })
    .limit(1);
  const date = latest[0].ranking_date;

  const { data: rows, count: rowCount } = await supabase
    .from('aita_rankings')
    .select('row_order', { count: 'exact' })
    .eq('category', category).eq('subcategory', subcategory).eq('ranking_date', date)
    .order('row_order', { ascending: true })
    .range(0, 4999);

  const orders = rows.map(r => r.row_order);
  const min = orders[0], max = orders[orders.length - 1];
  const gapless = min === 1 && max === orders.length && orders.length === rowCount;

  console.log(`${category} ${subcategory}: nullNames=${nullNames}, latest=${date} rows=${rowCount} row_order 1..${max} gapless=${gapless}`);
}

for (const [c, s] of combos) {
  await check(c, s);
}
