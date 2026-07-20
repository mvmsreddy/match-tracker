import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';

const POLL_MS = 60000;

// No Supabase Realtime subscriptions exist anywhere in this app — poll on an
// interval instead, same fetch-on-mount pattern as useTournamentActivity.
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
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
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().then(() => {});
    const interval = setInterval(() => { if (!cancelled) refresh(); }, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refresh]);

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
