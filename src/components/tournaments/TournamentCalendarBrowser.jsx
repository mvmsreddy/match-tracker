import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../api';
import AitaTournamentFactsheet from '../AitaTournamentFactsheet';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '../../lib/utils';

const AGE_GROUPS = ['Under 10', 'Under 12', 'Under 14', 'Under 16', 'Under 18', 'Men', 'Women', 'Senior'];

const DATE_PRESETS = [
  { key: '', label: 'All dates' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '3months', label: 'Next 3 months' },
];

const SORT_OPTIONS = [
  { key: 'date_asc', label: 'Date ↑' },
  { key: 'date_desc', label: 'Date ↓' },
  { key: 'name_asc', label: 'Name A–Z' },
];

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
  if (days <= 7) return { label: `Closes in ${days}d`, className: 'bg-primary/10 text-accent-ink' };
  return null;
}

const badgeCls = 'inline-flex items-center rounded-sm border border-transparent px-2 py-0.5 text-[0.68rem] font-semibold';
const selectCls = 'rounded-sm border border-input bg-transparent px-2.5 py-1.5 text-sm cursor-pointer';

// The unified "browse & enroll" calendar — merges AITA-synced tournaments
// with organizer-created ones (see api.listBrowsableTournaments). Shared by
// the full-page Tournament Calendar (AitaCalendarPage) and the player
// Tournament screen's "Browse & Enroll" section, so filters/cards/enroll
// routing only live in one place. `refreshToken` lets a parent (e.g. the
// super_admin "Sync Now" button on AitaCalendarPage) force a reload without
// this component needing to know why.
export default function TournamentCalendarBrowser({ refreshToken, claimMode = false, highlightId = '' }) {
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');

  const [ageGroup, setAgeGroup] = useState('');
  const [city, setCity] = useState('');
  const [grade, setGrade] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [sortBy, setSortBy] = useState('date_asc');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [facets, setFacets] = useState({ cities: [], grades: [] });
  const [selected, setSelected] = useState(null);

  const hasActiveFilters = !!(ageGroup || city || grade || datePreset || search);

  // Debounce free-text search so it doesn't fire a query per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    api.listAitaFilterFacets().then(setFacets).catch(() => {});
  }, []);

  useEffect(() => {
    const { dateFrom, dateTo } = presetToRange(datePreset);
    api.listBrowsableTournaments({
      ageGroup: ageGroup || undefined,
      city: city || undefined,
      grade: grade || undefined,
      dateFrom,
      dateTo,
      search: search || undefined,
    })
      .then(list => setTournaments(list))
      .catch(e => setError(e.message || 'Could not load the tournament calendar'));
  }, [ageGroup, city, grade, datePreset, search, refreshToken]);

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

  function openTournament(t) {
    if (t.kind === 'week' || t.linkedTournamentWeekId) {
      navigate(`/tournaments/${t.kind === 'week' ? t.id : t.linkedTournamentWeekId}`);
      return;
    }
    setSelected(t);
  }

  const displayed = useMemo(() => {
    let list = claimMode
      ? (tournaments || []).filter(t => t.kind === 'aita' && !t.linkedTournamentWeekId)
      : (tournaments || []);

    if (sortBy === 'date_desc') {
      list = [...list].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    } else if (sortBy === 'name_asc') {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      list = [...list].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    }
    return list;
  }, [tournaments, claimMode, sortBy]);

  return (
    <div className="space-y-4">
      {claimMode && (
        <div className="rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          Showing unclaimed AITA events only. Already-live events are managed under <strong>My Events</strong>.
        </div>
      )}
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
        <select className={selectCls} value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort tournaments">
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {tournaments === null && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading tournament calendar…</div>
      )}

      {displayed && displayed.length === 0 && tournaments && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {claimMode ? 'No unclaimed AITA tournaments match this filter.' : 'No tournaments found for this filter.'}
        </div>
      )}

      {displayed && displayed.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayed.map(t => {
            const urgency = entryUrgency(t.entryDeadline);
            const highlighted = highlightId && String(t.id) === String(highlightId);
            return (
              <button
                key={`${t.kind}-${t.id}`}
                onClick={() => openTournament(t)}
                className={cn(
                  'text-left flex flex-col gap-2 rounded-sm border bg-card hover:border-primary p-4',
                  highlighted ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                )}
              >
                <div className="text-sm font-bold">{t.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {claimMode && <span className={cn(badgeCls, 'bg-primary/10 text-accent-ink')}>Unclaimed</span>}
                  {t.kind === 'week' && !claimMode && <span className={cn(badgeCls, 'bg-chart-2/15 text-chart-2')}>Organizer-hosted</span>}
                  {t.linkedTournamentWeekId && t.kind === 'aita' && !claimMode && (
                    <span className={cn(badgeCls, 'bg-primary/10 text-accent-ink')}>On platform</span>
                  )}
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
            <AitaTournamentFactsheet t={selected} claimMode={claimMode} />
            <div className="pt-3">
              <Link to={`/aita-calendar/${selected.id}`} className="text-sm text-accent-ink hover:underline">
                Open as full page ↗
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
