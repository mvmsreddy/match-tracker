import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { computeEngineState, other } from '../lib/engine';
import { replayMatchAnalytics } from '../lib/analytics';
import { getFormatConfig, FORMAT_PRESETS } from '../lib/constants';
import { saveSession, loadSession, clearSession } from '../lib/storage';

const DEFAULT_HEADER = {
  selfName: 'Kundanapriya',
  oppName: '',
  tournament: '',
  date: '',
  surface: '',
  indoorOutdoor: '',
  oppHandedness: '',
  weather: '',
  notes: '',
};

function initialState() {
  return {
    header: { ...DEFAULT_HEADER },
    sessionType: 'match',
    formatPreset: 'bo3-full',
    formatCustom: '',
    pointTarget: 10,
    points: [],
    serverChoice: 'self',
    matchStartTime: null,
    matchEndTime: null,
    matchSaved: false,
    matchStarted: false,
  };
}

export function useMatchTracker() {
  const { user } = useAuth();
  const [state, setState] = useState(initialState);
  const [status, setStatus] = useState('');
  const statusTimer = useRef(null);
  const restoredRef = useRef(false);
  const [clockTick, setClockTick] = useState(0);

  // ---- Load saved session on mount (per logged-in user) ----
  useEffect(() => {
    if (!user) return;
    const saved = loadSession(user.id);
    if (saved) {
      setState((prev) => ({ ...prev, ...saved }));
      restoredRef.current = true;
      if (saved.points && saved.points.length > 0) showStatus('Restored your previous session');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- Autosave ----
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => saveSession(user.id, state), 150);
    return () => clearTimeout(t);
  }, [user, state]);

  // ---- Live clock tick while a match is running ----
  useEffect(() => {
    if (!state.matchStartTime || state.matchEndTime) return;
    const t = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state.matchStartTime, state.matchEndTime]);

  function showStatus(msg, ms = 2400) {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), ms);
  }

  const cfgOpts = useMemo(() => ({
    sessionType: state.sessionType,
    formatPreset: state.formatPreset,
    pointTarget: state.pointTarget,
  }), [state.sessionType, state.formatPreset, state.pointTarget]);

  const engine = useMemo(
    () => computeEngineState(state.points, cfgOpts, state.serverChoice),
    [state.points, cfgOpts, state.serverChoice],
  );

  const analytics = useMemo(
    () => replayMatchAnalytics(state.points, cfgOpts),
    [state.points, cfgOpts],
  );

  // "Next server" defaults to the engine's natural suggestion unless the coach
  // has manually overridden it for the point about to be logged.
  const nextServer = state.serverChoice;

  const matchDurationMs = state.matchStartTime
    ? (state.matchEndTime || Date.now()) - state.matchStartTime
    : 0;
  // clockTick is referenced only to force a re-render each second while live
  void clockTick;

  const updateHeader = useCallback((patch) => {
    setState((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
  }, []);

  const setServerChoice = useCallback((server) => {
    setState((prev) => ({ ...prev, serverChoice: server }));
  }, []);

  const setSessionType = useCallback((type) => {
    setState((prev) => {
      if (prev.sessionType === type) return prev;
      return { ...prev, sessionType: type, points: [], serverChoice: 'self', matchStartTime: null, matchEndTime: null };
    });
    showStatus(type === 'practice' ? 'Switched to Practice mode — session reset' : 'Switched to Match mode — session reset');
  }, []);

  const setFormatPreset = useCallback((preset) => {
    setState((prev) => ({ ...prev, formatPreset: preset }));
    showStatus(state.points.length > 0 ? 'Format changed — score re-checked against new rules' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.points.length]);

  const setFormatCustom = useCallback((text) => {
    setState((prev) => ({ ...prev, formatCustom: text }));
  }, []);

  const setPointTarget = useCallback((target) => {
    setState((prev) => ({ ...prev, pointTarget: target }));
  }, []);

  /**
   * Commits one finished point (built by the wizard) into the points array,
   * tagging it with its set/game index based on the CURRENT engine state.
   */
  const commitPoint = useCallback((pointData) => {
    setState((prev) => {
      const priorEngine = computeEngineState(prev.points, {
        sessionType: prev.sessionType, formatPreset: prev.formatPreset, pointTarget: prev.pointTarget,
      }, prev.serverChoice);
      const entry = {
        ...pointData,
        set: priorEngine.sets.length + 1,
        game: priorEngine.setGames.self + priorEngine.setGames.opp + 1,
      };
      const newPoints = [...prev.points, entry];
      const newEngine = computeEngineState(newPoints, {
        sessionType: prev.sessionType, formatPreset: prev.formatPreset, pointTarget: prev.pointTarget,
      }, prev.serverChoice);
      // Attach the human-readable "score after this point" (exactly what the engine returned for it)
      entry.scoreAfter = newEngine.lastScoreAfter;
      const matchStartTime = prev.matchStartTime || Date.now();
      const matchEndTime = newEngine.matchOver ? (prev.matchEndTime || Date.now()) : null;
      return {
        ...prev,
        points: newPoints,
        matchStartTime,
        matchEndTime,
        serverChoice: newEngine.currentServer,
      };
    });
  }, []);

  const undoLast = useCallback(() => {
    setState((prev) => {
      if (prev.points.length === 0) return prev;
      const newPoints = prev.points.slice(0, -1);
      const newEngine = computeEngineState(newPoints, {
        sessionType: prev.sessionType, formatPreset: prev.formatPreset, pointTarget: prev.pointTarget,
      }, prev.serverChoice);
      return {
        ...prev,
        points: newPoints,
        serverChoice: newEngine.currentServer,
        matchEndTime: newEngine.matchOver ? prev.matchEndTime : null,
      };
    });
  }, []);

  const markSaved = useCallback(() => {
    setState((prev) => ({ ...prev, matchSaved: true, matchEndTime: prev.matchEndTime || Date.now() }));
  }, []);

  const startMatch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      matchStarted: true,
      header: {
        ...prev.header,
        date: prev.header.date || new Date().toISOString().slice(0, 10),
      },
    }));
  }, []);

  const resetMatch = useCallback(() => {
    setState((prev) => ({
      ...initialState(),
      header: prev.header,
      sessionType: prev.sessionType,
      formatPreset: prev.formatPreset,
      pointTarget: prev.pointTarget,
    }));
    if (user) clearSession(user.id);
  }, [user]);

  const formatLabel = state.formatPreset === 'custom'
    ? (state.formatCustom || 'Custom format')
    : getFormatConfig(state.formatPreset).label;

  return {
    header: state.header, updateHeader,
    sessionType: state.sessionType, setSessionType,
    formatPreset: state.formatPreset, setFormatPreset,
    formatCustom: state.formatCustom, setFormatCustom,
    formatLabel,
    pointTarget: state.pointTarget, setPointTarget,
    points: state.points,
    matchStarted: state.matchStarted, startMatch,
    commitPoint, undoLast, resetMatch,
    nextServer, setServerChoice,
    engine, analytics,
    matchStartTime: state.matchStartTime, matchDurationMs,
    matchSaved: state.matchSaved, markSaved,
    status, showStatus,
    FORMAT_PRESETS,
  };
}
