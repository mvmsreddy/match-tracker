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
