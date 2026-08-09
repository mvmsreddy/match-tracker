/**
 * Tournament format catalog — every supported draw/league type.
 * Used by organizer UI (picker) and formatEngine (generation).
 */

export const FORMAT_CATEGORIES = [
  { id: 'knockout', label: 'Knockout' },
  { id: 'league', label: 'Round Robin / League' },
  { id: 'hybrid', label: 'Hybrid (Pools + KO, RR + Playoffs)' },
  { id: 'team', label: 'Team / Corporate' },
  { id: 'social', label: 'Social / Practice' },
];

/** @typedef {object} FormatDefinition */
export const FORMATS = {
  single_elimination: {
    id: 'single_elimination',
    label: 'Single Elimination',
    labelTe: 'Single Knockout',
    category: 'knockout',
    description: 'Standard AITA/ITF knockout bracket. One loss and you are out.',
    usesDrawSize: true,
    usesSeeds: true,
    usesQualifying: true,
    usesTeams: false,
    legacyPage: true,
    configFields: [],
  },
  double_elimination: {
    id: 'double_elimination',
    label: 'Double Elimination',
    labelTe: 'Double Elimination',
    category: 'knockout',
    description: 'Winners bracket + losers bracket. Two losses to exit.',
    usesDrawSize: true,
    usesSeeds: true,
    usesQualifying: false,
    usesTeams: false,
    configFields: [
      { key: 'grandFinalReset', type: 'boolean', label: 'Grand final reset if losers-bracket winner wins', default: true },
    ],
  },
  consolation: {
    id: 'consolation',
    label: 'Main + Consolation Draw',
    labelTe: 'Main + Back Draw',
    category: 'knockout',
    description: 'First-round losers drop into a consolation bracket (USTA-style).',
    usesDrawSize: true,
    usesSeeds: true,
    usesQualifying: false,
    usesTeams: false,
    configFields: [],
  },
  round_robin: {
    id: 'round_robin',
    label: 'Round Robin',
    labelTe: 'Round Robin (League)',
    category: 'league',
    description: 'Everyone plays everyone once. Champion = table leader.',
    usesDrawSize: false,
    usesTeams: true,
    minParticipants: 3,
    maxParticipants: 16,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams / players', default: 5, min: 3, max: 16 },
      { key: 'pointsWin', type: 'number', label: 'Points per win', default: 1 },
      { key: 'pointsDraw', type: 'number', label: 'Points per draw', default: 0 },
    ],
  },
  double_round_robin: {
    id: 'double_round_robin',
    label: 'Double Round Robin',
    labelTe: 'Double Round Robin (Home & Away)',
    category: 'league',
    description: 'Everyone plays everyone twice. Used in long club seasons.',
    usesDrawSize: false,
    usesTeams: true,
    minParticipants: 3,
    maxParticipants: 12,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams / players', default: 6, min: 3, max: 12 },
    ],
  },
  season_league: {
    id: 'season_league',
    label: 'Season League',
    labelTe: 'Season League (Multi-week RR)',
    category: 'league',
    description: 'Round robin spread across multiple match days/weeks — club minor leagues.',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams', default: 8, min: 4, max: 16 },
      { key: 'matchDays', type: 'number', label: 'Scheduled match days', default: 8, min: 1, max: 20 },
    ],
  },
  rr_playoffs: {
    id: 'rr_playoffs',
    label: 'Round Robin + Playoffs',
    labelTe: 'RR + Final & 3rd Place',
    category: 'hybrid',
    description: 'League stage then Final + 3rd place. Perfect for corporate 2-day events.',
    usesDrawSize: false,
    usesTeams: true,
    template: 'corporate_5',
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams', default: 5, min: 4, max: 12 },
      { key: 'playoffMode', type: 'select', label: 'Playoffs', default: 'final_and_third', options: [
        { value: 'final_and_third', label: 'Final + 3rd place (top 4)' },
        { value: 'top4_semis', label: 'Top 4 → Semis → Final + 3rd' },
        { value: 'top2_final_only', label: 'Top 2 → Final only' },
      ]},
    ],
  },
  rr_page_playoff: {
    id: 'rr_page_playoff',
    label: 'Round Robin + Page Playoff',
    labelTe: 'RR + Page Playoff (Top 4)',
    category: 'hybrid',
    description: 'League table then Page/McIntyre system for top 4 (cricket/AFL style).',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams', default: 6, min: 5, max: 10 },
    ],
  },
  pool_ko: {
    id: 'pool_ko',
    label: 'Pool Play + Knockout',
    labelTe: 'Groups + Knockout',
    category: 'hybrid',
    description: 'Round robin groups; top N from each pool advance to knockout (World Cup style).',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numPools', type: 'number', label: 'Number of pools', default: 2, min: 2, max: 8 },
      { key: 'poolSize', type: 'number', label: 'Teams per pool', default: 4, min: 3, max: 8 },
      { key: 'advancePerPool', type: 'number', label: 'Advance per pool', default: 2, min: 1, max: 4 },
    ],
  },
  pool_rr: {
    id: 'pool_rr',
    label: 'Pool Round Robin Only',
    labelTe: 'Groups only (no knockout)',
    category: 'league',
    description: 'Multiple round-robin groups; pool winners only (no knockout stage).',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numPools', type: 'number', label: 'Pools', default: 2, min: 2, max: 6 },
      { key: 'poolSize', type: 'number', label: 'Teams per pool', default: 4, min: 3, max: 6 },
    ],
  },
  swiss: {
    id: 'swiss',
    label: 'Swiss System',
    labelTe: 'Swiss System',
    category: 'league',
    description: 'Fixed rounds; pair players/teams with similar records each round (chess/esports style).',
    usesDrawSize: false,
    usesTeams: false,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Players / teams', default: 16, min: 4, max: 64 },
      { key: 'swissRounds', type: 'number', label: 'Number of rounds', default: 5, min: 3, max: 10 },
    ],
  },
  compass: {
    id: 'compass',
    label: 'Compass Draw',
    labelTe: 'Compass Draw',
    category: 'social',
    description: 'After R1, winners go East, losers West — four mini-brackets (USTA recreational).',
    usesDrawSize: true,
    usesSeeds: false,
    usesTeams: false,
    configFields: [
      { key: 'drawSize', type: 'number', label: 'Draw size', default: 16, min: 8, max: 32 },
    ],
  },
  king_of_court: {
    id: 'king_of_court',
    label: 'King of the Court',
    labelTe: 'King of the Court',
    category: 'social',
    description: 'Rotating format — winners stay on court, challengers rotate (social/practice).',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numCourts', type: 'number', label: 'Courts', default: 4, min: 2, max: 8 },
      { key: 'rotationRounds', type: 'number', label: 'Rotation rounds', default: 10, min: 4, max: 30 },
    ],
  },
  team_tie_rr: {
    id: 'team_tie_rr',
    label: 'Team Tie League (RR)',
    labelTe: 'Team Tie Round Robin',
    category: 'team',
    description: 'Team vs team round robin with tie scores (rubbers aggregated).',
    usesDrawSize: false,
    usesTeams: true,
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams', default: 5, min: 3, max: 12 },
      { key: 'rubbersPerTie', type: 'number', label: 'Rubbers per tie (courts used)', default: 2, min: 1, max: 5 },
    ],
  },
  team_tie_rr_playoffs: {
    id: 'team_tie_rr_playoffs',
    label: 'Corporate Team RR + Playoffs',
    labelTe: 'Corporate RR + Final/3rd',
    category: 'team',
    description: 'Exact corporate format: team ties on dual courts, RR then Final + 3rd place.',
    usesDrawSize: false,
    usesTeams: true,
    template: 'corporate_5',
    configFields: [
      { key: 'numParticipants', type: 'number', label: 'Teams', default: 5, min: 4, max: 10 },
      { key: 'rubbersPerTie', type: 'number', label: 'Courts / rubbers per tie', default: 2, min: 2, max: 4 },
      { key: 'playoffMode', type: 'select', label: 'Playoffs', default: 'final_and_third', options: [
        { value: 'final_and_third', label: 'Final + 3rd place' },
        { value: 'top2_final_only', label: 'Final only (top 2)' },
      ]},
    ],
  },
};

/** Quick-start templates for organizers */
export const FORMAT_TEMPLATES = {
  corporate_5: {
    id: 'corporate_5',
    label: '5-Team Corporate (RR + Final + 3rd)',
    format: 'team_tie_rr_playoffs',
    config: { numParticipants: 5, rubbersPerTie: 2, playoffMode: 'final_and_third' },
    defaultTeams: ['Defenders', 'Invincibles', 'Legends', 'Warriors', 'Guardians'],
  },
  club_league_8: {
    id: 'club_league_8',
    label: '8-Team Club League (Season RR)',
    format: 'season_league',
    config: { numParticipants: 8, matchDays: 10 },
    defaultTeams: [],
  },
  world_cup_16: {
    id: 'world_cup_16',
    label: '16-Team Pools + Knockout (4×4)',
    format: 'pool_ko',
    config: { numPools: 4, poolSize: 4, advancePerPool: 2 },
    defaultTeams: [],
  },
  usta_compass_16: {
    id: 'usta_compass_16',
    label: '16-Player Compass Draw',
    format: 'compass',
    config: { drawSize: 16 },
    defaultTeams: [],
  },
  davis_cup_style: {
    id: 'davis_cup_style',
    label: '6-Team Tie League + Semis',
    format: 'team_tie_rr_playoffs',
    config: { numParticipants: 6, rubbersPerTie: 3, playoffMode: 'top4_semis' },
    defaultTeams: [],
  },
};

export function getFormat(id) {
  return FORMATS[id] || FORMATS.single_elimination;
}

export function isLegacyKnockoutPage(format) {
  return getFormat(format).legacyPage === true;
}

export function defaultConfigForFormat(formatId) {
  const def = getFormat(formatId);
  const cfg = {};
  (def.configFields || []).forEach((f) => {
    cfg[f.key] = f.default ?? null;
  });
  return cfg;
}

export function listFormatsByCategory(categoryId) {
  return Object.values(FORMATS).filter((f) => f.category === categoryId);
}

export function formatLabel(formatId) {
  return getFormat(formatId).label;
}
