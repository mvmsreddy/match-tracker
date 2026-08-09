import { useEffect, useRef } from 'react';
import * as api from '../api';

function buildSnapshot(state) {
  return {
    header: state.header,
    sessionType: state.sessionType,
    formatPreset: state.formatPreset,
    formatCustom: state.formatCustom,
    pointTarget: state.pointTarget,
    trackingMode: state.trackingMode,
    serverChoice: state.serverChoice,
    points: state.points,
    matchStarted: state.matchStarted,
    matchStartTime: state.matchStartTime,
    matchEndTime: state.matchEndTime,
    status: state.matchEndTime || state.matchSaved ? 'ended' : 'live',
  };
}

// Mirrors in-progress tracker state to live_tracking_sessions for spectators.
export function useLiveTrackingSync({ enabled, sessionId, setSessionId, state, playerId, trackedById }) {
  const creatingRef = useRef(false);
  const lastEndedIdRef = useRef(null);

  useEffect(() => {
    if (!enabled || !trackedById || !state.matchStarted) return;
    if (sessionId || creatingRef.current) return;

    creatingRef.current = true;
    api.createLiveTrackingSession({
      playerId,
      trackedById,
      snapshot: buildSnapshot(state),
    })
      .then((row) => { if (row?.id) setSessionId(row.id); })
      .catch(() => {})
      .finally(() => { creatingRef.current = false; });
  // Snapshot at match start only — avoid recreating on every point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, state.matchStarted, playerId, trackedById, setSessionId]);

  useEffect(() => {
    if (!sessionId || !state.matchStarted) return;
    const timer = setTimeout(() => {
      api.updateLiveTrackingSession(sessionId, buildSnapshot(state)).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [
    sessionId,
    state.matchStarted,
    state.points,
    state.header,
    state.sessionType,
    state.formatPreset,
    state.serverChoice,
    state.matchStartTime,
    state.matchEndTime,
    state.matchSaved,
  ]);

  useEffect(() => {
    if (!sessionId) return;
    if (!state.matchEndTime && !state.matchSaved) return;
    if (lastEndedIdRef.current === sessionId) return;
    lastEndedIdRef.current = sessionId;
    api.endLiveTrackingSession(sessionId).catch(() => {});
  }, [sessionId, state.matchEndTime, state.matchSaved]);
}

export function endLiveTrackingSessionQuiet(sessionId) {
  if (!sessionId) return Promise.resolve();
  return api.endLiveTrackingSession(sessionId).catch(() => {});
}
