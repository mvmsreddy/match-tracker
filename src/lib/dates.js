// Local-timezone ISO date helpers. Native new Date().toISOString() returns a
// UTC date, so between 00:00 and TZ_OFFSET (e.g. 05:30 for IST) users would
// see yesterday's date as "today", making features that hinge on "matches
// scheduled for today" silently misbehave. These helpers stay on wall-clock.

/** Today, in the user's local timezone, as 'YYYY-MM-DD'. */
export function todayLocalIso() {
  return toLocalIso(new Date());
}

/** Convert a Date to a 'YYYY-MM-DD' string using its local components. */
export function toLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Same-day helper: returns true iff both refer to the same local calendar day. */
export function isSameLocalDay(isoA, isoB) {
  return isoA && isoB && isoA === isoB;
}
