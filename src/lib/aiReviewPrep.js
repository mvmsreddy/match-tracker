export function buildReviewPayload(points, scope, header) {
  let scoped;
  if (scope === 'match' || points.length === 0) {
    scoped = points;
  } else {
    // Scope off the last logged point's own set/game tags — correct both
    // right after a transition (last point ended that game/set) and
    // mid-game on demand (last point belongs to the in-progress game/set).
    const last = points[points.length - 1];
    if (scope === 'game') {
      scoped = points.filter((p) => p.set === last.set && p.game === last.game);
    } else if (scope === 'set') {
      scoped = points.filter((p) => p.set === last.set);
    } else {
      scoped = points;
    }
  }

  const compactPoints = scoped.map((p) => ({
    server: p.server,
    pointWinner: p.pointWinner,
    serveResult: p.serveResult,
    reason: p.reason,
    stroke: p.stroke,
    shotWing: p.shotWing,
    location: p.location,
    rally: p.rally,
    isReturn: p.isReturn,
    infraction: p.infraction || undefined,
    set: p.set,
    game: p.game,
  }));

  return {
    scope,
    header: {
      selfName: header.selfName,
      oppName: header.oppName,
      surface: header.surface,
      oppHandedness: header.oppHandedness,
    },
    points: compactPoints,
  };
}
