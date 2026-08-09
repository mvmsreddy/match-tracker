import { useEffect, useState } from 'react';
import * as api from '../../api';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SuperAdminOpsPanel() {
  const [calendarLog, setCalendarLog] = useState(null);
  const [rankingsState, setRankingsState] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState('');

  function reload() {
    Promise.all([
      api.getLatestAitaSyncLog().catch(() => null),
      api.getAitaRankingsSyncOverview?.().catch(() => null),
    ]).then(([cal, rank]) => {
      setCalendarLog(cal);
      setRankingsState(rank);
    });
  }

  useEffect(() => { reload(); }, []);

  async function runSync(kind) {
    setBusy(kind);
    setError('');
    setLastResult('');
    try {
      if (kind === 'calendar') {
        await api.triggerAitaSync();
        setLastResult('Calendar sync completed.');
      } else if (kind === 'rankings') {
        await api.triggerAitaRankingsSync();
        setLastResult('Rankings sync completed.');
      } else {
        await api.triggerUnifiedAitaSync();
        setLastResult('Calendar + rankings sync completed.');
      }
      reload();
    } catch (e) {
      setError(e.message || 'Sync failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <div className="font-bold text-sm">AITA data sync</div>
          <div className="text-xs text-muted-foreground mt-1">
            Official calendar and rankings are refreshed daily at midnight IST. Use these buttons for on-demand updates.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => runSync('all')}>
            {busy === 'all' ? 'Syncing all…' : 'Sync all now'}
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runSync('calendar')}>
            {busy === 'calendar' ? 'Syncing…' : 'Calendar only'}
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runSync('rankings')}>
            {busy === 'rankings' ? 'Syncing…' : 'Rankings only'}
          </Button>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        {lastResult && <div className="text-sm text-accent-ink">{lastResult}</div>}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4 text-sm">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Last calendar sync</div>
          {calendarLog ? (
            <div className="space-y-1 text-xs">
              <div>Started: {formatWhen(calendarLog.startedAt)}</div>
              <div>Finished: {formatWhen(calendarLog.finishedAt)}</div>
              <div>Upserted: {calendarLog.tournamentsUpserted ?? '—'} · Changed: {calendarLog.tournamentsChanged ?? '—'}</div>
              {calendarLog.error && <div className="text-destructive">{calendarLog.error}</div>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No sync log yet.</div>
          )}
        </Card>

        <Card className="p-4 text-sm">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Rankings sync state</div>
          {rankingsState?.combos?.length ? (
            <div className="text-xs text-muted-foreground">
              {rankingsState.combos.length} circuit combos tracked.
              {rankingsState.lastChecked && <> Last checked {formatWhen(rankingsState.lastChecked)}.</>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Run rankings sync to populate state.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
