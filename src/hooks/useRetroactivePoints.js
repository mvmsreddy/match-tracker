import { useState, useCallback, useMemo } from 'react';
import { computeEngineState } from '../lib/engine';

// Local (non-persisted-until-Save) point-commit reducer for adding
// point-by-point detail to an ALREADY-SAVED match, seeded from its existing
// points. Deliberately not useMatchTracker() — that hook autosaves to a
// single per-user localStorage session key meant for the one live match in
// progress; reusing it here would collide with that live session. This
// mirrors just its commitPoint/undoLast reducer shape (see
// src/hooks/useMatchTracker.js), scoped to one match and kept in memory
// only until the caller persists it via api.updateMatchPoints.
export function useRetroactivePoints(match) {
  const cfgOpts = useMemo(() => ({
    sessionType: match.sessionType, formatPreset: match.formatPreset, pointTarget: match.pointTarget,
  }), [match.sessionType, match.formatPreset, match.pointTarget]);

  const originalPoints = match.points || [];
  const originalCount = originalPoints.length;

  const [state, setState] = useState(() => {
    const seedEngine = computeEngineState(originalPoints, cfgOpts, originalPoints[originalPoints.length - 1]?.server || 'self');
    return { points: originalPoints, serverChoice: seedEngine.currentServer };
  });

  const engine = useMemo(() => computeEngineState(state.points, cfgOpts, state.serverChoice), [state, cfgOpts]);

  const setServerChoice = useCallback((server) => {
    setState((prev) => ({ ...prev, serverChoice: server }));
  }, []);

  const commitPoint = useCallback((pointData) => {
    setState((prev) => {
      const priorEngine = computeEngineState(prev.points, cfgOpts, prev.serverChoice);
      const entry = {
        ...pointData,
        set: priorEngine.sets.length + 1,
        game: priorEngine.setGames.self + priorEngine.setGames.opp + 1,
      };
      const newPoints = [...prev.points, entry];
      const newEngine = computeEngineState(newPoints, cfgOpts, prev.serverChoice);
      entry.scoreAfter = newEngine.lastScoreAfter;
      return { points: newPoints, serverChoice: newEngine.currentServer };
    });
  }, [cfgOpts]);

  const undoLast = useCallback(() => {
    setState((prev) => {
      if (prev.points.length <= originalCount) return prev; // never undo below the originally saved points
      const newPoints = prev.points.slice(0, -1);
      const newEngine = computeEngineState(newPoints, cfgOpts, prev.serverChoice);
      return { points: newPoints, serverChoice: newEngine.currentServer };
    });
  }, [cfgOpts, originalCount]);

  return {
    points: state.points,
    addedCount: state.points.length - originalCount,
    engine,
    nextServer: state.serverChoice,
    setServerChoice,
    commitPoint,
    canUndo: state.points.length > originalCount,
    undoLast,
  };
}
