import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  REST_TARGET_SEC,
  CHANGEOVER_TARGET_SEC,
  bucketRestMs,
  buildTimingFields,
} from '../lib/matchTiming';

const CHANGEOVER_STORAGE_KEY = 'mtp_last_changeover_total';

/**
 * Tracks point-to-point rest (20s) and changeover rest (90s) timers.
 * State lives in TrackerPage so it survives GameTransitionCard unmounts.
 */
export function useMatchTiming({
  pointsLength,
  lastCommittedAt,
  gamesSelf,
  gamesOpp,
  setsSelf,
  setsOpp,
}) {
  const [changeoverActive, setChangeoverActive] = useState(false);
  const [changeoverSecsLeft, setChangeoverSecsLeft] = useState(CHANGEOVER_TARGET_SEC);
  const [pointRestHidden, setPointRestHidden] = useState(false);
  const [tick, setTick] = useState(0);

  const pendingCaptureRef = useRef(null);
  const changeoverStartedAtRef = useRef(null);
  const prevPointsLengthRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pointsLength !== 0) return;
    sessionStorage.setItem(CHANGEOVER_STORAGE_KEY, '-1');
    setChangeoverActive(false);
    setChangeoverSecsLeft(CHANGEOVER_TARGET_SEC);
    setPointRestHidden(false);
    pendingCaptureRef.current = null;
    changeoverStartedAtRef.current = null;
    prevPointsLengthRef.current = 0;
  }, [pointsLength === 0]);

  useEffect(() => {
    const prev = prevPointsLengthRef.current;
    if (pointsLength > prev) {
      setPointRestHidden(false);
      pendingCaptureRef.current = null;

      const total = gamesSelf + gamesOpp + setsSelf * 6 + setsOpp * 6;
      const stored = Number(sessionStorage.getItem(CHANGEOVER_STORAGE_KEY) || '-1');
      if (total > stored && total > 0 && total % 2 === 1) {
        const now = Date.now();
        changeoverStartedAtRef.current = now;
        setChangeoverActive(true);
        setChangeoverSecsLeft(CHANGEOVER_TARGET_SEC);
        setPointRestHidden(true);
      }
      sessionStorage.setItem(CHANGEOVER_STORAGE_KEY, String(total));
    } else if (pointsLength < prev) {
      pendingCaptureRef.current = null;
      setPointRestHidden(false);
      setChangeoverActive(false);
      changeoverStartedAtRef.current = null;
    }
    prevPointsLengthRef.current = pointsLength;
  }, [pointsLength, gamesSelf, gamesOpp, setsSelf, setsOpp]);

  useEffect(() => {
    if (!changeoverActive) return;
    const t = setInterval(() => {
      setChangeoverSecsLeft((s) => {
        if (s <= 1) {
          setChangeoverActive(false);
          changeoverStartedAtRef.current = null;
          return CHANGEOVER_TARGET_SEC;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [changeoverActive]);

  const pointRestSecsLeft = useMemo(() => {
    if (pointRestHidden || changeoverActive || !lastCommittedAt || pointsLength === 0) return null;
    const elapsedSec = Math.floor((Date.now() - lastCommittedAt) / 1000);
    if (elapsedSec >= REST_TARGET_SEC) return null;
    return REST_TARGET_SEC - elapsedSec;
  }, [tick, pointRestHidden, changeoverActive, lastCommittedAt, pointsLength]);

  const onPointEntryStart = useCallback(() => {
    const now = Date.now();
    const pending = { ...(pendingCaptureRef.current || {}) };

    if (pointsLength > 0 && lastCommittedAt && !pending.restBeforePointMs) {
      const ms = now - lastCommittedAt;
      pending.restBeforePointMs = ms;
      pending.restBucket = bucketRestMs(ms);
    }

    if (changeoverStartedAtRef.current) {
      const ms = now - changeoverStartedAtRef.current;
      pending.changeoverBreakMs = ms;
      pending.changeoverAllowedMs = CHANGEOVER_TARGET_SEC * 1000;
      pending.changeoverUsedPct = Math.round((ms / (CHANGEOVER_TARGET_SEC * 1000)) * 100);
      changeoverStartedAtRef.current = null;
      setChangeoverActive(false);
    }

    pendingCaptureRef.current = Object.keys(pending).length ? pending : null;
    setPointRestHidden(true);
  }, [pointsLength, lastCommittedAt]);

  const dismissChangeover = useCallback(() => {
    changeoverStartedAtRef.current = null;
    setChangeoverActive(false);
  }, []);

  const consumePendingTiming = useCallback(() => {
    const cap = pendingCaptureRef.current;
    pendingCaptureRef.current = null;
    return buildTimingFields(cap);
  }, []);

  return {
    pointRestSecsLeft,
    changeoverActive,
    changeoverSecsLeft,
    onPointEntryStart,
    dismissChangeover,
    consumePendingTiming,
  };
}
