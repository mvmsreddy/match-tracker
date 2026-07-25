import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

const AGE_GROUPS = ['Under 10', 'Under 12', 'Under 14', 'Under 16', 'Under 18', 'Men', 'Women', 'Senior'];

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
  const isOrganizer = user?.role === 'organizer';

  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [search, setSearch] = useState('');
  const [syncLog, setSyncLog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  function loadTournaments() {
    api.listAitaTournaments({ ageGroup: ageGroup || undefined, search: search || undefined })
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
  }, [ageGroup, search]);

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
        <input
          type="text"
          placeholder="Search tournament name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border,#333)', background: 'transparent', color: 'inherit', fontSize: '0.78rem' }}
        />
        {syncLog?.startedAt && (
          <span className="t-info-item">
            Last synced: {timeAgo(syncLog.finishedAt || syncLog.startedAt)}
            {syncLog.error ? ' (last run failed)' : ''}
          </span>
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
          <div className="t-list">
            {tournaments.map(t => (
              <Link key={t.id} to={`/aita-calendar/${t.id}`} className="t-card">
                <div className="t-card-main">
                  <div className="t-card-name">{t.name}</div>
                  <div className="t-card-meta">
                    {t.ageGroup && <span className="t-badge">{t.ageGroup}</span>}
                    {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
                  </div>
                  <div className="t-card-location">
                    {[t.city, t.venue].filter(Boolean).join(' · ')}
                  </div>
                  {t.startDate && <div className="t-card-dates">{t.startDate}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
