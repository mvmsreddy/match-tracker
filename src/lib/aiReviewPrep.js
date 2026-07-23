export function buildReviewPayload(points, scope, engine, header) {
  let scoped;
  if (scope === 'game') {
    const set = engine.sets.length + 1;
    const game = engine.setGames.self + engine.setGames.opp + 1;
    scoped = points.filter((p) => p.set === set && p.game === game);
  } else if (scope === 'set') {
    const set = engine.sets.length + 1;
    scoped = points.filter((p) => p.set === set);
  } else {
    scoped = points;
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
