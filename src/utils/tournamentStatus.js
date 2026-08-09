// Shared entry/participation status derivation — used by the Dashboard's
// "My Tournaments" summary and the full player Tournament screen so the two
// never disagree on what stage a player is at.

export const PLAYER_TOURNAMENT_STATUS = {
  TRACKING: 'tracking',
  PENDING_ENTRY: 'pending_entry',
  ACCEPTED: 'accepted',
  PLACED: 'placed',
  WITHDRAWN: 'withdrawn',
  LIVE: 'live',
};

const BADGE = {
  tracking: { label: 'Tracking', className: 'bg-secondary text-secondary-foreground' },
  pending_entry: { label: 'Awaiting entry', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  accepted: { label: 'Accepted List', className: 'bg-muted text-muted-foreground' },
  placed: { label: 'In Draw', className: 'bg-primary/10 text-accent-ink' },
  withdrawn: { label: 'Withdrawn', className: 'bg-muted text-muted-foreground' },
  live: { label: 'Live', className: 'bg-destructive/10 text-destructive' },
};

// Real entry -> status badge. 'pending' means the organiser has accepted
// the entry but hasn't drawn/locked the bracket yet (still in the
// acceptance list); 'placed' means a real draw position exists, so the
// draw_type tells us qualifying vs main.
export function entryStatusBadge(entry) {
  if (entry.entryStatus === 'withdrawn') return BADGE.withdrawn;
  if (entry.entryStatus !== 'placed') return BADGE.accepted;
  return entry.drawType === 'qualifying'
    ? { label: 'Qualifying Draw', className: 'bg-primary/10 text-accent-ink' }
    : { label: 'Main Draw', className: 'bg-primary/10 text-accent-ink' };
}

// Declared-only (aita_participation_interest, no organiser/real entry yet)
// -> a date-driven prompt using the AITA factsheet dates we already have
// (aita_tournaments.qualifyingStartDate/startDate), instead of a flat
// "waiting" message the whole time.
export function declaredTournamentStatus(t) {
  const today = new Date().toISOString().slice(0, 10);
  if (t.qualifyingStartDate && today >= t.qualifyingStartDate && (!t.startDate || today < t.startDate)) {
    return { label: 'Qualifying draw should be out', ctaLabel: 'Upload qualifying draw', status: PLAYER_TOURNAMENT_STATUS.TRACKING };
  }
  if (t.startDate && today >= t.startDate) {
    return { label: 'Main draw should be out', ctaLabel: 'Upload main draw', status: PLAYER_TOURNAMENT_STATUS.TRACKING };
  }
  return { label: 'Waiting for draw', ctaLabel: 'Upload draw sheet', status: PLAYER_TOURNAMENT_STATUS.TRACKING };
}

// Unified player-facing status for one tournament row — merges interest-only
// tracking, the post-claim "dead zone", and real draw_entries.
export function derivePlayerTournamentStatus({ interest, entries = [], week }) {
  const hasLiveEvent = entries.some(({ event }) => event?.status === 'in_progress');
  if (hasLiveEvent) return { ...BADGE.live, status: PLAYER_TOURNAMENT_STATUS.LIVE };

  const activeEntries = entries.filter(({ entry }) => entry.entryStatus !== 'withdrawn');
  if (activeEntries.length > 0) {
    const worst = activeEntries.reduce((a, b) => {
      const aPlaced = a.entry.entryStatus === 'placed' ? 0 : 1;
      const bPlaced = b.entry.entryStatus === 'placed' ? 0 : 1;
      return aPlaced <= bPlaced ? a : b;
    });
    const badge = entryStatusBadge(worst.entry);
    const status = worst.entry.entryStatus === 'placed'
      ? PLAYER_TOURNAMENT_STATUS.PLACED
      : PLAYER_TOURNAMENT_STATUS.ACCEPTED;
    return { ...badge, status };
  }

  const t = interest?.tournament;
  if (t?.linkedTournamentWeekId || week?.id) {
    return { ...BADGE.pending_entry, status: PLAYER_TOURNAMENT_STATUS.PENDING_ENTRY };
  }

  if (t) {
    const declared = declaredTournamentStatus(t);
    return { label: declared.label, className: BADGE.tracking.className, status: PLAYER_TOURNAMENT_STATUS.TRACKING, ctaLabel: declared.ctaLabel };
  }

  return { ...BADGE.tracking, status: PLAYER_TOURNAMENT_STATUS.TRACKING };
}

export function playerTournamentLink({ interest, week }) {
  if (week?.id) return `/tournaments/${week.id}`;
  const linkedWeekId = interest?.tournament?.linkedTournamentWeekId;
  if (linkedWeekId) return `/tournaments/${linkedWeekId}`;
  if (interest?.tournament?.id) return `/aita-calendar/${interest.tournament.id}`;
  return '/tournaments';
}
