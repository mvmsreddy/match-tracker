// Helpers for coach/parent proxy tracking — saving match data to a linked
// player's account while the logged-in delegate enters points courtside.

export function sessionStorageKey(viewerId, subjectPlayerId = null) {
  if (!viewerId) return null;
  if (!subjectPlayerId || subjectPlayerId === viewerId) return viewerId;
  return `${viewerId}:for:${subjectPlayerId}`;
}

export function parseTrackForState(locationState) {
  const playerId = locationState?.trackForPlayerId || null;
  const playerName = locationState?.trackForPlayerName || '';
  if (!playerId) return null;
  return { playerId, playerName };
}
