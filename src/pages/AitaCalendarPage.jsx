import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import AitaTournamentFactsheet from '../components/AitaTournamentFactsheet';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '../lib/utils';

const AGE_GROUPS = ['Under 10', 'Under 12', 'Under 14', 'Under 16', 'Under 18', 'Men', 'Women', 'Senior'];

const DATE_PRESETS = [
  { key: '', label: 'All dates' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '3months', label: 'Next 3 months' },
];

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

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function presetToRange(preset) {
  const days = preset === 'week' ? 7 : preset === 'month' ? 30 : preset === '3months' ? 90 : null;
  if (!days) return {};
  const today = new Date();
  const to = new Date(today.getTime() + days * 86400000);
  return { dateFrom: toIsoDate(today), dateTo: toIsoDate(to) };
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T23:59:59`);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

function entryUrgency(entryDeadline) {
  const days = daysUntil(entryDeadline);
  if (days === null) return null;
  if (days < 0) return { label: 'Entries closed', className: 'bg-muted text-muted-foreground' };
  if (days <= 3) return { label: days === 0 ? 'Entries close today' : `Closes in ${days}d`, className: 'bg-destructive/10 text-destructive' };
  if (days <= 7) return { label: `Closes in ${days}d`, className: 'bg-primary/10 text-primary' };
  return null;
}

const badgeCls = 'inline-flex items-center rounded-sm border border-transparent px-2 py-0.5 text-[0.68rem] font-semibold';
const selectCls = 'rounded-sm border border-input bg-transparent px-2.5 py-1.5 text-sm cursor-pointer';

export default function AitaCalendarPage() {
  const { user } = useAuth();
  const isOrganizer = user?.role === 'organizer';

  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');

  const [ageGroup, setAgeGroup] = useState('');
  const [city, setCity] = useState('');
  const [grade, setGrade] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [facets, setFacets] = useState({ cities: [], grades: [] });
  const [selected, setSelected] = useState(null);

  const [syncLog, setSyncLog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const hasActiveFilters = !!(ageGroup || city || grade || datePreset || search);

  // Debounce free-text search so it doesn't fire a query per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    api.listAitaFilterFacets().then(setFacets).catch(() => {});
  }, []);

  function loadTournaments() {
    const { dateFrom, dateTo } = presetToRange(datePreset);
    api.listAitaTournaments({
      ageGroup: ageGroup || undefined,
      city: city || undefined,
      grade: grade || undefined,
      dateFrom,
      dateTo,
      search: search || undefined,
    })
      .then(list => setTournaments(list))
      .catch(e => setError(e.message || 'Could not load the AITA calendar'));
  }

  function loadSyncLog() {
    api.getLatestAitaSyncLog().then(setSyncLog).catch(() => {});
  }

  useEffect(() => {
    loadTournaments();
    loadSyncLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageGroup, city, grade, datePreset, search]);

  useEffect(() => {
    if (!selected) return;
    function onKey(e) {
      if (e.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  function clearFilters() {
    setAgeGroup('');
    setCity('');
    setGrade('');
    setDatePreset('');
    setSearchInput('');
  }

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.triggerAitaSync();
      setSyncMessage(`Synced — ${result.upserted ?? 0} tournaments updated (${result.changed ?? 0} changed).`);
      loadTournaments();
      loadSyncLog();
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
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Mirrored from aitatennis.com</div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">AITA Calendar</h1>
        </div>
        {isOrganizer && (
          <Button onClick={handleSyncNow} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync Now'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
          <option value="">All age groups</option>
          {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className={selectCls} value={city} onChange={e => setCity(e.target.value)}>
          <option value="">All cities</option>
          {facets.cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectCls} value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {facets.grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <Input
          type="text"
          placeholder="Search tournament name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-56"
        />
        {syncLog?.startedAt && (
          <span className="text-xs text-muted-foreground">
            Last synced: {timeAgo(syncLog.finishedAt || syncLog.startedAt)}
            {syncLog.error ? ' (last run failed)' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card">
          {DATE_PRESETS.map(p => (
            <button
              key={p.key || 'all'}
              type="button"
              onClick={() => setDatePreset(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-sm text-xs font-semibold',
                datePreset === p.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {syncMessage && (
        <div className="border border-border bg-muted/40 rounded-sm p-3 text-sm text-muted-foreground">{syncMessage}</div>
      )}

      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {tournaments === null && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading AITA calendar…</div>
      )}

      {tournaments && tournaments.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No tournaments found for this filter.</div>
      )}

      {tournaments && tournaments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tournaments.map(t => {
            const urgency = entryUrgency(t.entryDeadline);
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="text-left flex flex-col gap-2 rounded-sm border border-border bg-card hover:border-primary p-4"
              >
                <div className="text-sm font-bold">{t.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {t.ageGroup && <span className={cn(badgeCls, 'bg-secondary text-secondary-foreground')}>{t.ageGroup}</span>}
                  {t.grade && <span className={cn(badgeCls, 'bg-secondary text-secondary-foreground')}>{t.grade}</span>}
                  {urgency && <span className={cn(badgeCls, urgency.className)}>{urgency.label}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[t.city, t.venue].filter(Boolean).join(' · ')}
                </div>
                {t.startDate && <div className="text-xs text-muted-foreground">{t.startDate}</div>}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div
            className="bg-card border border-border rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <span className="text-lg font-display font-extrabold tracking-tight">{selected.name}</span>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-secondary shrink-0"
              >
                ✕
              </button>
            </div>
            <AitaTournamentFactsheet t={selected} />
            <div className="pt-3">
              <Link to={`/aita-calendar/${selected.id}`} className="text-sm text-primary hover:underline">
                Open as full page ↗
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
