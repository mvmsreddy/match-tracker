import { useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import {
  computeActivityPace,
  computeCourtReadiness,
  computeMatchStreakWeeks,
  countMatchesInMonth,
  DEFAULT_MINIMUM_MATCHES,
  DEFAULT_MONTHLY_TARGET,
  matchMonthKey,
  monthlyMatchVolumeSeries,
  nativeCircuitKeyFromProfile,
} from '../lib/activityGoals';

export function usePlayerActivity(playerId, { profileComplete = true, rankBehindPace = false } = {}) {
  const [matches, setMatches] = useState(null);
  const [goal, setGoal] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!playerId) {
      setMatches([]);
      setGoal(null);
      return;
    }
    let cancelled = false;
    setMatches(null);
    setGoal(undefined);
    Promise.all([
      api.listMatches(playerId),
      api.getActivityGoal(playerId),
    ])
      .then(([m, g]) => {
        if (cancelled) return;
        setMatches(m);
        setGoal(g || {
          monthlyTarget: DEFAULT_MONTHLY_TARGET,
          minimumMatches: DEFAULT_MINIMUM_MATCHES,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || 'Could not load activity');
        setMatches([]);
        setGoal({
          monthlyTarget: DEFAULT_MONTHLY_TARGET,
          minimumMatches: DEFAULT_MINIMUM_MATCHES,
        });
      });
    return () => { cancelled = true; };
  }, [playerId]);

  const monthKey = matchMonthKey();
  const monthlyTarget = goal?.monthlyTarget ?? DEFAULT_MONTHLY_TARGET;
  const minimumMatches = goal?.minimumMatches ?? DEFAULT_MINIMUM_MATCHES;

  const stats = useMemo(() => {
    const list = matches || [];
    const thisMonth = countMatchesInMonth(list, monthKey);
    const pace = computeActivityPace(thisMonth, monthlyTarget, minimumMatches, monthKey);
    const streakWeeks = computeMatchStreakWeeks(list, 2);
    const volumeSeries = monthlyMatchVolumeSeries(list, 6);
    const tournamentCount = list.filter((m) => m.sessionType === 'match' && m.tournament).length;
    const practiceCount = list.filter((m) => m.sessionType === 'practice').length;
    const readiness = computeCourtReadiness({ activityPace: pace, rankBehindPace, profileComplete });
    return {
      thisMonth,
      pace,
      streakWeeks,
      volumeSeries,
      tournamentCount,
      practiceCount,
      totalMatches: list.length,
    };
  }, [matches, monthKey, monthlyTarget, minimumMatches, rankBehindPace, profileComplete]);

  async function saveGoal(patch) {
    const next = {
      monthlyTarget: patch.monthlyTarget ?? monthlyTarget,
      minimumMatches: patch.minimumMatches ?? minimumMatches,
    };
    const saved = await api.upsertActivityGoal(playerId, next);
    setGoal(saved);
    return saved;
  }

  return {
    loading: matches === null || goal === undefined,
    error,
    matches: matches || [],
    goal: goal || { monthlyTarget: DEFAULT_MONTHLY_TARGET, minimumMatches: DEFAULT_MINIMUM_MATCHES },
    stats,
    saveGoal,
    nativeCircuitKey: null,
  };
}

export function useNativeCircuitKey(dateOfBirth, gender) {
  return useMemo(
    () => nativeCircuitKeyFromProfile(dateOfBirth, gender),
    [dateOfBirth, gender],
  );
}
