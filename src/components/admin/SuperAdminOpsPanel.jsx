import { useEffect, useState } from 'react';
import * as api from '../../api';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';

function formatWhen(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatUnifiedResult(result) {
  if (!result) return '';
  const cal = result.calendar;
  const rank = result.rankings;
  const calMsg = cal?.error
    ? `Calendar failed: ${cal.error}`
    : `Calendar: ${cal?.upserted ?? 0} upserted, ${cal?.changed ?? 0} changed`;
  const rankRows = (rank?.summary || []).reduce((sum, s) => sum + (s.rowsUpserted || 0), 0);
  const rankDates = (rank?.summary || []).reduce((sum, s) => sum + (s.datesUpserted || 0), 0);
  const rankMsg = rank?.error
    ? `Rankings failed: ${rank.error}`
    : `Rankings: ${rankDates} new date(s), ${rankRows} rows`;
  return result.partial ? `${calMsg}. ${rankMsg} (partial success)` : `${calMsg}. ${rankMsg}.`;
}

export default function SuperAdminOpsPanel() {
  const [calendarLog, setCalendarLog] = useState(null);
  const [rankingsState, setRankingsState] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState('');

  function reload() {
    Promise.all([
      api.getLatestAitaSyncLog().catch(() => null),
      api.getAitaRankingsSyncOverview?.().catch(() => null),
      api.getAitaSyncDiagnostics?.().catch(() => null),
    ]).then(([cal, rank, diag]) => {
      setCalendarLog(cal);
      setRankingsState(rank);
      setDiagnostics(diag);
    });
  }

  useEffect(() => { reload(); }, []);

  async function runSync(kind) {
    setBusy(kind);
    setError('');
    setLastResult('');
    try {
      if (kind === 'calendar') {
        const result = await api.triggerAitaSync();
        setLastResult(`Calendar: ${result?.upserted ?? 0} upserted, ${result?.changed ?? 0} changed.`);
      } else if (kind === 'rankings') {
        const result = await api.triggerAitaRankingsSync();
        const rows = (result?.summary || []).reduce((sum, s) => sum + (s.rowsUpserted || 0), 0);
        const dates = (result?.summary || []).reduce((sum, s) => sum + (s.datesUpserted || 0), 0);
        setLastResult(dates > 0 ? `Rankings: ${dates} new date(s), ${rows} rows.` : 'Rankings: no new dates since last check.');
      } else {
        const result = await api.triggerUnifiedAitaSync();
        setLastResult(formatUnifiedResult(result));
      }
      reload();
    } catch (e) {
      setError(e.message || 'Sync failed');
      reload();
    } finally {
      setBusy('');
    }
  }

  const latestRankLog = diagnostics?.recentRankingSyncs?.[0];

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <div className="font-bold text-sm">AITA data sync</div>
          <div className="text-xs text-muted-foreground mt-1">
            Official calendar and rankings are refreshed daily at midnight IST. Use these buttons for on-demand updates.
          </div>
        </div>

        {diagnostics && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-sm border border-border px-3 py-2">
              <div className="text-muted-foreground">Tournaments in DB</div>
              <div className="font-bold text-lg">{diagnostics.calendarTournamentCount ?? '—'}</div>
            </div>
            <div className="rounded-sm border border-border px-3 py-2">
              <div className="text-muted-foreground">Ranking rows in DB</div>
              <div className="font-bold text-lg">{diagnostics.rankingRowCount ?? '—'}</div>
            </div>
          </div>
        )}

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
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{rankingsState.combos.length} circuit combos tracked.</div>
              {rankingsState.lastChecked && <div>Last checked {formatWhen(rankingsState.lastChecked)}.</div>}
              {latestRankLog && (
                <div>
                  Last run: {latestRankLog.rows_upserted ?? 0} rows
                  {latestRankLog.error ? ` · error: ${latestRankLog.error}` : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Run rankings sync to populate state.</div>
              {latestRankLog?.error && <div className="text-destructive">{latestRankLog.error}</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
