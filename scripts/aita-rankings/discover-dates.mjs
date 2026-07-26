// Regenerates the full Category/SubCategory -> published-dates catalog
// referenced in AITA_RANKINGS_PLAN.md section 3. Read-only, no DB writes.
//
// Usage: node scripts/aita-rankings/discover-dates.mjs
import { writeFileSync } from 'fs';
import { CATEGORIES, listDatesFor } from './lib.mjs';

const results = [];
let totalDates = 0;
for (const [cat, subcats] of Object.entries(CATEGORIES)) {
  for (const subcat of subcats) {
    const dates = await listDatesFor(cat, subcat);
    totalDates += dates.length;
    results.push({ cat, subcat, count: dates.length, latest: dates[0] || null, oldest: dates[dates.length - 1] || null, dates });
    console.log(`${cat} / ${subcat}: ${dates.length} dates (latest ${dates[0] || 'none'}, oldest ${dates[dates.length - 1] || 'none'})`);
  }
}

console.log('\nTOTAL combos:', results.length);
console.log('TOTAL combo-date pairs:', totalDates);

writeFileSync('scripts/aita-rankings/ranking_dates_catalog.json', JSON.stringify(results, null, 2), 'utf8');
