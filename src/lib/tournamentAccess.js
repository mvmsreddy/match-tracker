// Shared tournament access helpers — mirror phase51 RLS intent on the client.

export function isTournamentOwner(week, userId) {
  return !!(week && userId && week.createdBy === userId);
}

/** Organizers may only manage tournaments they own. Other roles use player/public rules. */
export function organizerBlockedFromWeek(week, user) {
  return user?.role === 'organizer' && week && !isTournamentOwner(week, user.id);
}

export function canViewManagementTabs({ isOwner, userRole }) {
  return isOwner || userRole !== 'organizer';
}
