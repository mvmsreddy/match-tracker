// Computes where an organizer is in the hosting workflow and what to do next.
// Stages: setup → entries → draw → matches → complete

export const ORGANIZER_STAGES = {
  setup: { label: 'Setup', order: 1 },
  entries: { label: 'Accepting Entries', order: 2 },
  draw: { label: 'Build Draw', order: 3 },
  matches: { label: 'Run Matches', order: 4 },
  complete: { label: 'Complete', order: 5 },
};

export function computeOrganizerStage(week, events = []) {
  const meta = { week, events, eventCount: events.length };

  if (!events.length) {
    return {
      stage: 'setup',
      ...ORGANIZER_STAGES.setup,
      summary: 'Add events before opening entries.',
      cta: { label: '+ Add your first event', action: 'add_event' },
      ...meta,
    };
  }

  if (events.every(e => e.status === 'complete')) {
    return {
      stage: 'complete',
      ...ORGANIZER_STAGES.complete,
      summary: 'All events finished.',
      cta: null,
      ...meta,
    };
  }

  if (events.some(e => e.status === 'in_progress')) {
    return {
      stage: 'matches',
      ...ORGANIZER_STAGES.matches,
      summary: 'Tournament in progress — enter scores on the bracket.',
      cta: { label: 'Enter scores →', action: 'first_event' },
      ...meta,
    };
  }

  if (events.some(e => e.status === 'draw_ready')) {
    return {
      stage: 'matches',
      ...ORGANIZER_STAGES.matches,
      summary: 'Draw published — enter match scores when play begins.',
      cta: { label: 'Go to bracket →', action: 'first_draw_ready_event' },
      ...meta,
    };
  }

  const openCount = events.filter(e => e.entriesOpen).length;
  if (openCount > 0) {
    return {
      stage: 'entries',
      ...ORGANIZER_STAGES.entries,
      summary: `${openCount}/${events.length} event${events.length !== 1 ? 's' : ''} accepting entries.`,
      cta: openCount < events.length
        ? { label: 'Open all entries', action: 'open_all_entries' }
        : { label: 'Manage entries →', action: 'first_event' },
      ...meta,
    };
  }

  return {
    stage: 'draw',
    ...ORGANIZER_STAGES.draw,
    summary: 'Entries closed — publish the draw when ready.',
    cta: { label: 'Publish draw →', action: 'first_event' },
    ...meta,
  };
}

export function stageBadgeClass(stage) {
  switch (stage) {
    case 'setup': return 'bg-muted text-muted-foreground';
    case 'entries': return 'bg-primary/10 text-accent-ink';
    case 'draw': return 'bg-chart-3/15 text-chart-3';
    case 'matches': return 'bg-chart-2/15 text-chart-2';
    case 'complete': return 'bg-secondary text-secondary-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function sourceBadge(week) {
  if (week?.source === 'aita_claimed') {
    return { label: 'AITA Event · You manage', className: 'bg-chart-2/15 text-chart-2' };
  }
  if (week?.source === 'organiser' || !week?.source) {
    return { label: 'Your event', className: 'bg-primary/10 text-accent-ink' };
  }
  return null;
}

export function pickEventForAction(events, action) {
  if (!events?.length) return null;
  if (action === 'first_draw_ready_event') {
    return events.find(e => e.status === 'draw_ready' || e.status === 'in_progress') || events[0];
  }
  return events[0];
}
