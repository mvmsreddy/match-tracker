// Registry of governing bodies shown on the Player Performance tab.
//
// Each body owns its own category taxonomy because age-group conventions
// don't line up across bodies (AITA runs U-12/14/16/18; ITF Juniors is a
// single combined U-18 ranking; USTA runs 12s/14s/16s/18s; etc). Adding a
// new body later is a matter of adding an entry here plus a data source —
// not a UI rewrite. Only AITA has a real data pipeline today (see
// AITA_RANKINGS_PLAN.md); others are listed so the picker communicates
// what's coming rather than silently omitting them.
export const GOVERNING_BODIES = [
  {
    id: 'AITA',
    label: 'AITA',
    fullName: 'All India Tennis Association',
    available: true,
    categories: [
      { category: 'Boys', subcategory: 'U-12', label: 'Boys U-12' },
      { category: 'Boys', subcategory: 'U-14', label: 'Boys U-14' },
      { category: 'Boys', subcategory: 'U-16', label: 'Boys U-16' },
      { category: 'Boys', subcategory: 'U-18', label: 'Boys U-18' },
      { category: 'Girls', subcategory: 'U-12', label: 'Girls U-12' },
      { category: 'Girls', subcategory: 'U-14', label: 'Girls U-14' },
      { category: 'Girls', subcategory: 'U-16', label: 'Girls U-16' },
      { category: 'Girls', subcategory: 'U-18', label: 'Girls U-18' },
      { category: 'Men', subcategory: 'Singles', label: 'Men Singles' },
      { category: 'Men', subcategory: 'Doubles', label: 'Men Doubles' },
      { category: 'Women', subcategory: 'Singles', label: 'Women Singles' },
      { category: 'Women', subcategory: 'Doubles', label: 'Women Doubles' },
    ],
  },
  {
    id: 'ITF',
    label: 'ITF',
    fullName: 'International Tennis Federation',
    available: false,
    categories: [],
  },
];

export function findGoverningBody(id) {
  return GOVERNING_BODIES.find(b => b.id === id) || GOVERNING_BODIES[0];
}

export function circuitKey(category, subcategory) {
  return `${category}|${subcategory}`;
}

// ---------------------------------------------------------------------------
// Taxonomy bridges — this codebase has three incompatible age-group/category
// string conventions (AITA rankings above uses hyphenated 'U-12'; the
// tournament schema's `events.age_group` uses 'U12'; the match tracker's
// header uses spelled-out 'Under 12'). These are pure string-format mappings
// onto the canonical {category, subcategory} shape used above — NOT ranking
// or points logic, and NOT related to the (explicitly rejected) idea that
// points "cascade" between age groups. Every AITA category is independent;
// see AITA_RANKINGS_PLAN.md and the multi-segment dashboard plan for why.
// ---------------------------------------------------------------------------

// events.category is 'Boys Singles'|'Girls Singles'|'Boys Doubles'|
// 'Girls Doubles'|'Mixed Doubles'; events.age_group is 'U10'|'U12'|...|'U18'|
// 'Open'. Returns null when there's no clean 1:1 mapping onto the AITA-style
// taxonomy above (Mixed Doubles has no Boys/Girls equivalent; an unexpected
// category/age_group combination).
export function normalizeEventSegment(rawCategory, rawAgeGroup) {
  if (!rawCategory) return null;
  const genderMatch = rawCategory.match(/^(Boys|Girls|Men|Women)\b/i);
  if (!genderMatch) return null; // e.g. 'Mixed Doubles'
  const gender = genderMatch[1][0].toUpperCase() + genderMatch[1].slice(1).toLowerCase();
  if (gender === 'Boys' || gender === 'Girls') {
    const ageMatch = (rawAgeGroup || '').match(/^U(\d+)$/i);
    if (!ageMatch) return null; // e.g. 'Open' on a junior category
    return { category: gender, subcategory: `U-${ageMatch[1]}` };
  }
  const drawMatch = rawCategory.match(/(Singles|Doubles)$/i);
  if (!drawMatch) return null;
  const draw = drawMatch[1][0].toUpperCase() + drawMatch[1].slice(1).toLowerCase();
  return { category: gender, subcategory: draw };
}

// Tracker header's ageGroup is 'Under 10'|...|'Under 18'|'Men'|'Women'|
// 'Senior'. Unlike `events`, there's no separate gender field for juniors —
// 'Under 12' alone doesn't say Boys or Girls — so the caller must supply the
// player's own gender ('M'|'F', from user_profiles.gender) to resolve a
// junior ageGroup. Returns null for 'Senior' (no equivalent in the taxonomy
// above) or when gender is missing/unrecognized for a junior ageGroup. Note
// this also can't distinguish Singles from Doubles for the adult Men/Women
// case — the tracker header doesn't capture that separately either.
export function normalizeTrackerSegment(rawAgeGroup, playerGender) {
  if (!rawAgeGroup) return null;
  if (rawAgeGroup === 'Men') return { category: 'Men', subcategory: 'Singles' };
  if (rawAgeGroup === 'Women') return { category: 'Women', subcategory: 'Singles' };
  const juniorMatch = rawAgeGroup.match(/^Under (\d+)$/i);
  if (!juniorMatch) return null; // 'Senior' or unrecognized
  if (playerGender !== 'M' && playerGender !== 'F') return null;
  return { category: playerGender === 'M' ? 'Boys' : 'Girls', subcategory: `U-${juniorMatch[1]}` };
}
