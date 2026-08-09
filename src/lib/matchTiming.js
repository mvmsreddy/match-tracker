export const REST_TARGET_SEC = 20;
export const CHANGEOVER_TARGET_SEC = 90;

/** Classify ms between points for analytics buckets. */
export function bucketRestMs(ms) {
  if (ms <= 5000) return 'immediate';
  if (ms <= 10000) return 'short';
  if (ms <= 15000) return 'medium';
  if (ms <= 20000) return 'long';
  return 'full_wait';
}

export const REST_BUCKET_LABELS = {
  immediate: '≤5s (immediate)',
  short: '6–10s (short)',
  medium: '11–15s (medium)',
  long: '16–20s (long)',
  full_wait: '20s+ (full wait)',
};

export function buildTimingFields(cap) {
  if (!cap) return {};
  const out = {};
  if (cap.restBeforePointMs != null) {
    out.restBeforePointMs = cap.restBeforePointMs;
    out.restBucket = cap.restBucket || bucketRestMs(cap.restBeforePointMs);
  }
  if (cap.changeoverBreakMs != null) {
    out.changeoverBreakMs = cap.changeoverBreakMs;
    out.changeoverAllowedMs = cap.changeoverAllowedMs ?? CHANGEOVER_TARGET_SEC * 1000;
    out.changeoverUsedPct = cap.changeoverUsedPct
      ?? Math.round((cap.changeoverBreakMs / out.changeoverAllowedMs) * 100);
  }
  return out;
}

/** Win rate by rest bucket for one player (skips first point of match). */
export function computeRestPaceStats(points, player = 'self') {
  const buckets = Object.keys(REST_BUCKET_LABELS).reduce((acc, key) => {
    acc[key] = { count: 0, won: 0 };
    return acc;
  }, {});

  points.forEach((pt, idx) => {
    if (idx === 0 || pt.restBucket == null) return;
    const b = buckets[pt.restBucket];
    if (!b) return;
    b.count += 1;
    if (pt.pointWinner === player) b.won += 1;
  });

  return Object.entries(buckets)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({
      bucket: key,
      label: REST_BUCKET_LABELS[key],
      count: v.count,
      won: v.won,
      winPct: v.count > 0 ? (v.won / v.count) * 100 : 0,
    }));
}

/** Summary of changeover breaks taken before the first point of a new odd game. */
export function computeChangeoverStats(points) {
  const rows = points.filter((pt) => pt.changeoverBreakMs != null);
  if (rows.length === 0) return null;

  const avgMs = rows.reduce((sum, pt) => sum + pt.changeoverBreakMs, 0) / rows.length;
  const avgUsedPct = rows.reduce((sum, pt) => sum + (pt.changeoverUsedPct ?? 0), 0) / rows.length;
  const early = rows.filter((pt) => pt.changeoverBreakMs < CHANGEOVER_TARGET_SEC * 1000 * 0.5).length;
  const full = rows.filter((pt) => pt.changeoverBreakMs >= CHANGEOVER_TARGET_SEC * 1000).length;

  return {
    count: rows.length,
    avgSec: Math.round(avgMs / 1000),
    avgUsedPct: Math.round(avgUsedPct),
    earlyCount: early,
    fullCount: full,
  };
}
