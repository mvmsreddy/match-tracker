import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import AitaTournamentFactsheet from '../components/AitaTournamentFactsheet';

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
  if (days < 0) return { label: 'Entries closed', className: 't-badge-closed' };
  if (days <= 3) return { label: days === 0 ? 'Entries close today' : `Closes in ${days}d`, className: 't-badge-urgent' };
  if (days <= 7) return { label: `Closes in ${days}d`, className: 't-badge-soon' };
  return null;
}

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
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">AITA Calendar</h1>
            <div className="subtitle">MIRRORED FROM AITATENNIS.COM</div>
          </div>
          {isOrganizer && (
            <button className="action-btn primary" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : '⟳ Sync Now'}
            </button>
          )}
        </div>
      </div>

      <div className="t-week-info-bar">
        <select className="t-badge" style={{ cursor: 'pointer' }} value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
          <option value="">All age groups</option>
          {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="t-badge" style={{ cursor: 'pointer' }} value={city} onChange={e => setCity(e.target.value)}>
          <option value="">All cities</option>
          {facets.cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="t-badge" style={{ cursor: 'pointer' }} value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">All grades</option>
          {facets.grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search tournament name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border,#333)', background: 'transparent', color: 'inherit', fontSize: '0.78rem' }}
        />
        {syncLog?.startedAt && (
          <span className="t-info-item">
            Last synced: {timeAgo(syncLog.finishedAt || syncLog.startedAt)}
            {syncLog.error ? ' (last run failed)' : ''}
          </span>
        )}
      </div>

      <div className="chip-row" style={{ padding: '0 16px' }}>
        {DATE_PRESETS.map(p => (
          <span
            key={p.key || 'all'}
            className={`chip${datePreset === p.key ? ' selected' : ''}`}
            onClick={() => setDatePreset(p.key)}
          >
            {p.label}
          </span>
        ))}
        {hasActiveFilters && (
          <span className="chip warn" onClick={clearFilters}>Clear filters</span>
        )}
      </div>

      {syncMessage && <div className="history-empty" style={{ padding: '8px 16px' }}>{syncMessage}</div>}

      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}

        {tournaments === null && !error && (
          <div className="history-empty">Loading AITA calendar…</div>
        )}

        {tournaments && tournaments.length === 0 && (
          <div className="history-empty">No tournaments found for this filter.</div>
        )}

        {tournaments && tournaments.length > 0 && (
          <div className="t-grid">
            {tournaments.map(t => {
              const urgency = entryUrgency(t.entryDeadline);
              return (
                <button key={t.id} className="t-tile" onClick={() => setSelected(t)}>
                  <div className="t-card-name">{t.name}</div>
                  <div className="t-card-meta">
                    {t.ageGroup && <span className="t-badge">{t.ageGroup}</span>}
                    {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
                    {urgency && <span className={`t-badge ${urgency.className}`}>{urgency.label}</span>}
                  </div>
                  <div className="t-card-location">
                    {[t.city, t.venue].filter(Boolean).join(' · ')}
                  </div>
                  {t.startDate && <div className="t-card-dates">{t.startDate}</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="t-modal-overlay" onClick={() => setSelected(null)}>
          <div className="t-modal t-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">{selected.name}</span>
              <button className="drawer-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <AitaTournamentFactsheet t={selected} />
            <div style={{ paddingTop: 10 }}>
              <Link to={`/aita-calendar/${selected.id}`} className="t-breadcrumb">
                Open as full page ↗
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
