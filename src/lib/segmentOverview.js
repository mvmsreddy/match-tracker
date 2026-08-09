import { normalizeEventSegment } from './governingBodies';
import { circuitKey } from './governingBodies';
import { PLAYER_TOURNAMENT_STATUS } from '../utils/tournamentStatus';

const ACTIVE_STATUSES = new Set([
  PLAYER_TOURNAMENT_STATUS.tracking,
  PLAYER_TOURNAMENT_STATUS.pending_entry,
  PLAYER_TOURNAMENT_STATUS.accepted,
  PLAYER_TOURNAMENT_STATUS.placed,
  PLAYER_TOURNAMENT_STATUS.live,
]);

/** Segment circuit keys represented by one tournament participation row. */
export function segmentKeysForTournamentItem(item) {
  const keys = new Set();
  for (const { event } of item?.entries || []) {
    const seg = normalizeEventSegment(event?.category, event?.ageGroup);
    if (seg) keys.add(circuitKey(seg.category, seg.subcategory));
  }
  const t = item?.interest?.tournament;
  if (t) {
    const seg = normalizeEventSegment(
      item.interest?.selectedCategory || t.category,
      item.interest?.selectedAgeGroup || t.ageGroup,
    );
    if (seg) keys.add(circuitKey(seg.category, seg.subcategory));
  }
  return keys;
}

/** Count active tournament rows per circuit key from useMyTournaments items. */
export function countTournamentsBySegment(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!ACTIVE_STATUSES.has(item.status)) continue;
    let segKey = null;
    for (const { event } of item.events || []) {
      const seg = normalizeEventSegment(event?.category, event?.ageGroup);
      if (seg) {
        segKey = circuitKey(seg.category, seg.subcategory);
        break;
      }
    }
    if (!segKey && item.week?.events?.length) {
      const seg = normalizeEventSegment(item.week.events[0]?.category, item.week.events[0]?.ageGroup);
      if (seg) segKey = circuitKey(seg.category, seg.subcategory);
    }
    if (!segKey) continue;
    map.set(segKey, (map.get(segKey) || 0) + 1);
  }
  return map;
}

export function rankDeltaLabel(circuit) {
  if (!circuit?.previous || !circuit?.latest) return null;
  const delta = circuit.previous.rank - circuit.latest.rank;
  if (delta > 0) return { text: `↑${delta}`, positive: true };
  if (delta < 0) return { text: `↓${Math.abs(delta)}`, positive: false };
  return { text: '—', positive: null };
}
