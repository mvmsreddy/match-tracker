// ---------------------------------------------------------------------------
// TOURNAMENT MOCK LAYER
// ---------------------------------------------------------------------------
// Seeds a realistic multi-tournament history for the demo player when the app
// runs without Supabase. Enables:
//   • TodaysMatchHero — one entry has a match dated TODAY
//   • Tournaments historical filter — entries span this year, last year, and
//     multiple months so year/month/last-12m/range chips are all meaningful
//   • Segment schedule hook — round tokens, opponents and dates all resolve
//
// Every function returns a Promise so the surface matches supabaseApi.js's.
// ---------------------------------------------------------------------------

// Rolling anchor dates so seeds stay "today-relative" no matter when the demo
// user visits. All dates are ISO YYYY-MM-DD.
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoDaysAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const TODAY = isoDaysAgo(0);
const YESTERDAY = isoDaysAgo(1);
const TOMORROW = isoDaysAhead(1);

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const TOURNAMENTS = [
  // A live tournament — day 3 is TODAY. Powers the Today's Match hero.
  {
    id: 'w-live-2026',
    name: 'Deccan Open Under-18',
    startDate: isoDaysAgo(2),  // ran R32 two days ago, R16 yesterday, QF today
    endDate: isoDaysAhead(3),
    city: 'Pune',
    stateAbbr: 'MH',
    grade: 'CS-7',
  },
  // Wrapped up last week — recent history
  {
    id: 'w-recent-1',
    name: 'Baroda Junior Championships',
    startDate: isoDaysAgo(30),
    endDate: isoDaysAgo(26),
    city: 'Vadodara',
    stateAbbr: 'GJ',
    grade: 'CS-5',
  },
  // Earlier this year
  {
    id: 'w-this-year',
    name: 'MSLTA State Ranking',
    startDate: isoDaysAgo(120),
    endDate: isoDaysAgo(116),
    city: 'Mumbai',
    stateAbbr: 'MH',
    grade: 'AITA Talent Series',
  },
  // Last year — powers year filter chips
  {
    id: 'w-last-year',
    name: 'All India Nationals Qualifier',
    startDate: isoDaysAgo(300),
    endDate: isoDaysAgo(296),
    city: 'Bengaluru',
    stateAbbr: 'KA',
    grade: 'CS-7',
  },
  // Two years back
  {
    id: 'w-two-years',
    name: 'Delhi State Open',
    startDate: isoDaysAgo(560),
    endDate: isoDaysAgo(556),
    city: 'New Delhi',
    stateAbbr: 'DL',
    grade: 'CS-3',
  },
];

// One event (a specific age-group draw) per tournament. Category/ageGroup here
// must feed normalizeEventSegment() and yield {category:'U18', subcategory:'Singles'}
// for the demo player's default segment.
const EVENTS = [
  { id: 'e-live-u18s',      weekId: 'w-live-2026',    category: 'BS',   ageGroup: 'U-18', drawSize: 32, drawType: 'singles' },
  { id: 'e-recent-u18s',    weekId: 'w-recent-1',     category: 'BS',   ageGroup: 'U-18', drawSize: 32, drawType: 'singles' },
  { id: 'e-this-year-u18s', weekId: 'w-this-year',    category: 'BS',   ageGroup: 'U-18', drawSize: 32, drawType: 'singles' },
  { id: 'e-last-year-u18s', weekId: 'w-last-year',    category: 'BS',   ageGroup: 'U-16', drawSize: 32, drawType: 'singles' },
  { id: 'e-two-yr-u16s',    weekId: 'w-two-years',    category: 'BS',   ageGroup: 'U-16', drawSize: 32, drawType: 'singles' },
];

// The demo player is entry #101 in every event; opponents are #201, #202, #203.
const OWN_ENTRY_ID_PREFIX = 'entry-me-';

const DRAW_ENTRIES = {
  'e-live-u18s': [
    { id: 'entry-me-live', firstName: 'Aarav', familyName: 'Sharma', isBye: false, seed: 4 },
    { id: 'entry-opp-live-1', firstName: 'Vihaan', familyName: 'Reddy',   isBye: false },
    { id: 'entry-opp-live-2', firstName: 'Kabir',  familyName: 'Menon',   isBye: false },
    { id: 'entry-opp-live-3', firstName: 'Neel',   familyName: 'Iyer',    isBye: false, seed: 1 },
  ],
  'e-recent-u18s': [
    { id: 'entry-me-recent', firstName: 'Aarav', familyName: 'Sharma', isBye: false, seed: 6 },
    { id: 'entry-opp-r1', firstName: 'Rohan',  familyName: 'Deshmukh', isBye: false },
    { id: 'entry-opp-r2', firstName: 'Aryan',  familyName: 'Bhat',     isBye: false, seed: 3 },
  ],
  'e-this-year-u18s': [
    { id: 'entry-me-ty', firstName: 'Aarav', familyName: 'Sharma', isBye: false },
    { id: 'entry-opp-ty1', firstName: 'Yash', familyName: 'Kulkarni', isBye: false },
    { id: 'entry-opp-ty2', firstName: 'Ishaan', familyName: 'Nair', isBye: false, seed: 2 },
  ],
  'e-last-year-u18s': [
    { id: 'entry-me-ly', firstName: 'Aarav', familyName: 'Sharma', isBye: false, seed: 8 },
    { id: 'entry-opp-ly1', firstName: 'Karan', familyName: 'Verma', isBye: false },
  ],
  'e-two-yr-u16s': [
    { id: 'entry-me-2y', firstName: 'Aarav', familyName: 'Sharma', isBye: false },
    { id: 'entry-opp-2y1', firstName: 'Sameer', familyName: 'Chopra', isBye: false, seed: 5 },
  ],
};

// Matches per event.  dayNumber=1 == first day of the tournament, etc.  The
// LIVE tournament has today == startDate+2, so we mark dayNumber=3 as the
// active "today" match (status='scheduled' so the tracker can pick it up).
const EVENT_MATCHES = {
  'e-live-u18s': [
    { id: 'm-live-r32', round: 32, dayNumber: 1, status: 'complete', entry1Id: 'entry-me-live', entry2Id: 'entry-opp-live-1', winnerEntryId: 'entry-me-live', score: '6-3 6-4' },
    { id: 'm-live-r16', round: 16, dayNumber: 2, status: 'complete', entry1Id: 'entry-me-live', entry2Id: 'entry-opp-live-2', winnerEntryId: 'entry-me-live', score: '7-5 6-2' },
    { id: 'm-live-qf',  round: 8,  dayNumber: 3, status: 'scheduled', entry1Id: 'entry-me-live', entry2Id: 'entry-opp-live-3', winnerEntryId: null, score: null },
  ],
  'e-recent-u18s': [
    { id: 'm-r-r32', round: 32, dayNumber: 1, status: 'complete', entry1Id: 'entry-me-recent', entry2Id: 'entry-opp-r1', winnerEntryId: 'entry-me-recent', score: '6-2 6-4' },
    { id: 'm-r-r16', round: 16, dayNumber: 2, status: 'complete', entry1Id: 'entry-me-recent', entry2Id: 'entry-opp-r2', winnerEntryId: 'entry-opp-r2', score: '4-6 5-7' },
  ],
  'e-this-year-u18s': [
    { id: 'm-ty-r32', round: 32, dayNumber: 1, status: 'complete', entry1Id: 'entry-me-ty', entry2Id: 'entry-opp-ty1', winnerEntryId: 'entry-me-ty', score: '6-1 6-2' },
    { id: 'm-ty-r16', round: 16, dayNumber: 2, status: 'complete', entry1Id: 'entry-me-ty', entry2Id: 'entry-opp-ty2', winnerEntryId: 'entry-opp-ty2', score: '3-6 4-6' },
  ],
  'e-last-year-u18s': [
    { id: 'm-ly-r32', round: 32, dayNumber: 1, status: 'complete', entry1Id: 'entry-me-ly', entry2Id: 'entry-opp-ly1', winnerEntryId: 'entry-opp-ly1', score: '2-6 6-4 3-6' },
  ],
  'e-two-yr-u16s': [
    { id: 'm-2y-r32', round: 32, dayNumber: 1, status: 'complete', entry1Id: 'entry-me-2y', entry2Id: 'entry-opp-2y1', winnerEntryId: 'entry-me-2y', score: '6-4 6-3' },
  ],
};

// ---------------------------------------------------------------------------
// API surface — same shapes supabaseApi.js exports
// ---------------------------------------------------------------------------
const DELAY_MS = 120;
const delay = () => new Promise((r) => setTimeout(r, DELAY_MS));

function eventWithWeek(ev) {
  const week = TOURNAMENTS.find((w) => w.id === ev.weekId);
  return {
    id: ev.id,
    category: ev.category,
    ageGroup: ev.ageGroup,
    drawSize: ev.drawSize,
    drawType: ev.drawType,
    week: week ? { ...week } : null,
  };
}

function ownEntryForEvent(evId) {
  return (DRAW_ENTRIES[evId] || []).find((e) => e.id.startsWith(OWN_ENTRY_ID_PREFIX));
}

export async function getMyEntries() {
  await delay();
  return EVENTS.map((ev) => {
    const mine = ownEntryForEvent(ev.id);
    if (!mine) return null;
    return {
      id: mine.id,
      eventId: ev.id,
      drawType: ev.drawType,
      seed: mine.seed || null,
      firstName: mine.firstName,
      familyName: mine.familyName,
      event: eventWithWeek(ev),
    };
  }).filter(Boolean);
}

export async function getEventMatches(eventId /* , drawType */) {
  await delay();
  return (EVENT_MATCHES[eventId] || []).map((m) => ({ ...m }));
}

export async function getDrawEntries(eventId /* , drawType */) {
  await delay();
  return (DRAW_ENTRIES[eventId] || []).map((e) => ({ ...e }));
}
