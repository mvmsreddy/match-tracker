import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TournamentCalendarBrowser from '../components/tournaments/TournamentCalendarBrowser';
import { Button } from '@/components/primitives/button';

function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function AitaCalendarPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [syncLog, setSyncLog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    api.getLatestAitaSyncLog().then(setSyncLog).catch(() => {});
  }, []);

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.triggerAitaSync();
      setSyncMessage(`Synced — ${result.upserted ?? 0} tournaments updated (${result.changed ?? 0} changed).`);
      api.getLatestAitaSyncLog().then(setSyncLog).catch(() => {});
      setRefreshToken(t => t + 1);
    } catch (e) {
      setSyncMessage(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
            AITA calendar + organizer-hosted tournaments
            {syncLog?.startedAt && (
              <span className="normal-case font-normal">
                {' '}· Last synced: {timeAgo(syncLog.finishedAt || syncLog.startedAt)}
                {syncLog.error ? ' (last run failed)' : ''}
              </span>
            )}
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Tournament Calendar</h1>
        </div>
        {isSuperAdmin && (
          <Button onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync Now'}
          </Button>
        )}
      </div>

      {syncMessage && (
        <div className="border border-border bg-muted/40 rounded-sm p-3 text-sm text-muted-foreground">{syncMessage}</div>
      )}

      <TournamentCalendarBrowser refreshToken={refreshToken} />
    </div>
  );
}
