// Shared entry/participation status derivation — used by both the Dashboard's
// "My Tournaments" summary and the full player Tournament screen so the two
// never disagree on what stage a player is at.

// Real entry -> status badge. 'pending' means the organiser has accepted
// the entry but hasn't drawn/locked the bracket yet (still in the
// acceptance list); 'placed' means a real draw position exists, so the
// draw_type tells us qualifying vs main.
export function entryStatusBadge(entry) {
  if (entry.entryStatus === 'withdrawn') return { label: 'Withdrawn', className: 'bg-muted text-muted-foreground' };
  if (entry.entryStatus !== 'placed') return { label: 'Accepted List', className: 'bg-muted text-muted-foreground' };
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
    return { label: 'Qualifying draw should be out', ctaLabel: 'Upload qualifying draw' };
  }
  if (t.startDate && today >= t.startDate) {
    return { label: 'Main draw should be out', ctaLabel: 'Upload main draw' };
  }
  return { label: 'Waiting for draw', ctaLabel: 'Upload draw sheet' };
}
