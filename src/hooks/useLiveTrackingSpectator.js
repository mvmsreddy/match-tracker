import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as api from '../api';
import { computeEngineState } from '../lib/engine';
import { replayMatchAnalytics } from '../lib/analytics';
import { getFormatConfig } from '../lib/constants';

function rowToSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    playerId: row.player_id,
    trackedBy: row.tracked_by,
    status: row.status,
    header: row.header || {},
    sessionType: row.session_type,
    formatPreset: row.format_preset,
    formatCustom: row.format_custom,
    pointTarget: row.point_target,
    trackingMode: row.tracking_mode,
    serverChoice: row.server_choice,
    points: row.points || [],
    matchStarted: row.match_started,
    matchStartTime: row.match_start_time,
    matchEndTime: row.match_end_time,
    updatedAt: row.updated_at,
  };
}

export function useLiveTrackingSpectator(sessionId) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!sessionId) return;
    try {
      const row = await api.getLiveTrackingSession(sessionId);
      setSnapshot(rowToSnapshot(row));
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load live session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!sessionId || !supabase) return;
    const channel = supabase
      .channel(`live-tracking:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_tracking_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSnapshot(rowToSnapshot(payload.new));
          setLoading(false);
          setError('');
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const cfgOpts = useMemo(() => ({
    sessionType: snapshot?.sessionType || 'match',
    formatPreset: snapshot?.formatPreset || 'bo3-full',
    pointTarget: snapshot?.pointTarget || 10,
  }), [snapshot?.sessionType, snapshot?.formatPreset, snapshot?.pointTarget]);

  const engine = useMemo(() => {
    if (!snapshot?.points) return null;
    return computeEngineState(snapshot.points, cfgOpts, snapshot.serverChoice || 'self');
  }, [snapshot?.points, snapshot?.serverChoice, cfgOpts]);

  const analytics = useMemo(() => {
    if (!snapshot?.points?.length) return null;
    return replayMatchAnalytics(snapshot.points, cfgOpts);
  }, [snapshot?.points, cfgOpts]);

  const formatLabel = snapshot?.formatPreset === 'custom'
    ? (snapshot?.formatCustom || 'Custom format')
    : getFormatConfig(snapshot?.formatPreset || 'bo3-full').label;

  const matchDurationMs = snapshot?.matchStartTime
    ? ((snapshot.matchEndTime || Date.now()) - snapshot.matchStartTime)
    : 0;

  return {
    snapshot,
    engine,
    analytics,
    formatLabel,
    matchDurationMs,
    loading,
    error,
    reload,
    isLive: snapshot?.status === 'live' && snapshot?.matchStarted,
  };
}

export function useActiveLiveSession(playerId) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!playerId) { setSession(null); return; }
    let cancelled = false;
    function load() {
      api.getActiveLiveTrackingSession(playerId)
        .then(row => { if (!cancelled) setSession(row); })
        .catch(() => { if (!cancelled) setSession(null); });
    }
    load();
    const timer = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [playerId]);

  return session;
}
