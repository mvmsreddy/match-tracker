import { extractPdfText, parseJuniorRankingPdfText } from './lib.mjs';

const cases = [
  { name: 'Boys U-12 (variant A, 5 nums) 2026-07-13', url: 'https://aitatennis.com/management/upload/ranking/2026-07-13_BU-12.pdf', expectRow1: { player: 'RIAAN ATUL NANDANKAR', total: 1077.75 } },
  { name: 'Girls U-14 (variant B, 6 nums) 2026-07-13', url: 'https://aitatennis.com/management/upload/ranking/2026-07-13_GU-14.pdf', expectRow1: { player: 'PADMA PRIYA RAMESHKUMAR', total: 1389.125 } },
  { name: 'Boys U-16 pre-transition (variant A) 2021-01-11', url: 'https://aitatennis.com/management/upload/ranking/BU-16_80.pdf', expectRow1: { player: 'AAYUSH P BHAT', total: 587.5 } },
  { name: 'Boys U-16 post-transition (variant B) 2026-07-13', url: 'https://aitatennis.com/management/upload/ranking/2026-07-13_BU-16.pdf', expectRow1: { player: 'TAVISH PAHWA', total: 1291 } },
  { name: 'Boys U-18 (variant C, 7 nums) 2026-07-13', url: 'https://aitatennis.com/management/upload/ranking/2026-07-13_BU-18.pdf', expectRow1: { player: 'ARNAV VIJAY PAPARKAR', total: 3081 } },
  { name: 'Girls U-18 (variant C, 7 nums) 2026-07-13', url: 'https://aitatennis.com/management/upload/ranking/2026-07-13_GU-18.pdf', expectRow1: { player: 'MAAYA RAJESHWARAN REVATHI', total: 2815.6 } },
];

for (const c of cases) {
  try {
    const text = await extractPdfText(c.url);
    const rows = parseJuniorRankingPdfText(text);
    const row1 = rows[0];
    const ok = row1 && row1.playerName === c.expectRow1.player && Math.abs(row1.totalPoints - c.expectRow1.total) < 0.001;
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name}`);
    console.log(`  rows parsed: ${rows.length}`);
    console.log(`  row1: ${row1?.playerName} total=${row1?.totalPoints} (expected ${c.expectRow1.player} / ${c.expectRow1.total})`);
    console.log(`  row1 breakdown:`, row1?.pointsBreakdown);
  } catch (e) {
    console.log(`ERROR — ${c.name}: ${e.message}`);
  }
  console.log();
}
