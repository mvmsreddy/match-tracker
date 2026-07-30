// Mock AITA ranking history generator for demo mode (when Supabase isn't
// configured). Emits a realistic multi-week rank/points trajectory across a
// couple of circuits so the Dashboard's Performance Snapshot and every
// downstream chart actually has something to render.
//
// Shape matches supabaseApi.getPlayerAitaRankingHistory rows:
//   { category, subcategory, date, rank, totalPoints }

const CIRCUITS = [
  { category: 'U16', subcategory: 'Singles', startRank: 245, startPts: 78 },
  { category: 'U16', subcategory: 'Doubles', startRank: 168, startPts: 112 },
  { category: 'U18', subcategory: 'Singles', startRank: 402, startPts: 34 },
];

function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Deterministic per-string seed — same aitaReg -> same trajectory.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Realistic mixed-but-rising trajectory. Points are cumulative-earnings-like
// (points only go up meaningfully — occasional flat weeks), while rank moves
// both directions with an overall improving trend.
function buildTrajectory({ startRank, startPts, weeks, rng }) {
  const out = [];
  let rank = startRank;
  let pts = startPts;
  for (let i = 0; i < weeks; i++) {
    const daysAgo = (weeks - 1 - i) * 14; // fortnightly snapshots
    const bigJump = rng() < 0.25;
    const goodWeek = rng() < 0.68;

    // Rank moves up (improves) more often than down; big jumps sometimes
    const rankDelta = bigJump
      ? Math.round((goodWeek ? -1 : 1) * (12 + rng() * 25))
      : Math.round((goodWeek ? -1 : 1) * (2 + rng() * 6));

    // Points earned per fortnight — earn 8-40 on good weeks, 0-6 on flat
    const ptsGained = goodWeek
      ? Math.round(8 + rng() * (bigJump ? 32 : 20))
      : Math.round(rng() * 6);

    rank = Math.max(1, rank + rankDelta);
    pts = pts + ptsGained;
    out.push({ date: isoDate(daysAgo), rank, totalPoints: pts });
  }
  return out;
}

export function generateMockRankingHistory(aitaReg = 'DEMO') {
  const seed = hash(String(aitaReg));
  const rng = seededRandom(seed);
  const rows = [];
  for (const c of CIRCUITS) {
    const traj = buildTrajectory({
      startRank: c.startRank,
      startPts: c.startPts,
      weeks: 10 + Math.floor(rng() * 4), // 10–13 snapshots
      rng,
    });
    for (const t of traj) {
      rows.push({
        category: c.category,
        subcategory: c.subcategory,
        date: t.date,
        rank: t.rank,
        totalPoints: t.totalPoints,
      });
    }
  }
  return rows;
}
