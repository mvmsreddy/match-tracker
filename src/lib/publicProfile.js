/** Public profile helpers — slug, defaults, URL builders */

export const PROFILE_VISIBILITY = {
  private: { id: 'private', label: 'Private', description: 'Only you, your coach, and parent can see full data.' },
  link: { id: 'link', label: 'Link only', description: 'Anyone with your link can see your public card.' },
  public: { id: 'public', label: 'Public', description: 'Discoverable profile card (no contact details).' },
};

export const DEFAULT_PRIVACY_SETTINGS = {
  showRanking: true,
  showWinRate: true,
  showTournamentCount: true,
  showTitles: true,
  showClub: true,
  showCity: true,
  showBio: true,
  showTrackerRating: true,
  showAvailability: true,
  showPlaysHand: true,
  showEquipment: false,
};

export const PRIVACY_TOGGLES = [
  { key: 'showCity', label: 'City & state' },
  { key: 'showClub', label: 'Club / academy' },
  { key: 'showBio', label: 'Public bio' },
  { key: 'showRanking', label: 'AITA ranking' },
  { key: 'showTrackerRating', label: 'Tracker rating' },
  { key: 'showWinRate', label: 'Win rate & match count' },
  { key: 'showTournamentCount', label: 'Tournaments played' },
  { key: 'showTitles', label: 'Wins & highlights' },
  { key: 'showPlaysHand', label: 'Plays hand' },
  { key: 'showAvailability', label: '"Interested to play" post' },
  { key: 'showEquipment', label: 'Equipment (racquet/shoes)' },
];

export function slugifyProfileHandle(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function isValidProfileSlug(slug) {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug || '');
}

export function publicProfileUrl(slug, origin = '') {
  if (!slug) return null;
  return `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/p/${slug}`;
}

export function linkOnlyProfileUrl(token, origin = '') {
  if (!token) return null;
  return `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/p/t/${token}`;
}

export function mergePrivacySettings(existing) {
  return { ...DEFAULT_PRIVACY_SETTINGS, ...(existing || {}) };
}

export const PLAYS_PUBLIC = { R: 'Right-handed', L: 'Left-handed' };
