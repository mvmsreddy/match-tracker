import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import * as api from '../api';

const POLL_MS = 60000;

// Phase 38 — Supabase Realtime subscription (see supabase/
// phase38_realtime_notifications.sql) delivers new/updated notifications
// within ~1s instead of waiting up to POLL_MS. The poll stays as a fallback
// (network hiccups, tab was backgrounded when the realtime socket dropped,
// mock-mode/no-Supabase-config where `supabase` is null) rather than being
// replaced outright.
export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
    try {
      const [list, count] = await Promise.all([
        api.getMyNotifications(),
        api.getUnreadNotificationCount(),
      ]);
      setNotifications(list);
      setUnreadCount(count);
    } catch {
      // Best-effort — leave stale data in place rather than erroring the UI.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().then(() => {});
    const interval = setInterval(() => { if (!cancelled) refresh(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refresh]);

  // Keyed on userId (a stable primitive) rather than refresh/user (both of
  // which get a new identity on every Supabase auth event — token refresh,
  // tab-focus re-check, not just actual login/logout) — otherwise this
  // effect tears down and resubscribes the channel on every such event,
  // which is a real problem here since NotificationsBell mounts this hook
  // on every authenticated page via AppShell's header.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!userId || !supabase) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => refreshRef.current(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  async function markRead(id) {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await api.markNotificationRead(id).catch(() => {});
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await api.markAllNotificationsRead().catch(() => {});
  }

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh };
}
