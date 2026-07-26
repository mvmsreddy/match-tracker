import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';

const PAGE_SIZE = 50;

function formatDob(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export default function AitaRankingsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isOrganizer = user?.role === 'organizer';
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [facets, setFacets] = useState(null);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [dates, setDates] = useState([]);
  const [date, setDate] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [result, setResult] = useState(null); // { rows, totalCount }
  const [error, setError] = useState('');

  // Load the catalog of combos that actually have data, and default to the first one.
  useEffect(() => {
    api.listAitaRankingFacets()
      .then(list => {
        setFacets(list);
        if (list.length > 0) {
          setCategory(list[0].category);
          setSubcategory(list[0].subcategory);
        }
      })
      .catch(e => setError(e.message || 'Could not load AITA rankings'));
  }, []);

  // Keep subcategory valid whenever category changes (default to its first option).
  useEffect(() => {
    if (!facets || !category) return;
    const options = [...new Set(facets.filter(f => f.category === category).map(f => f.subcategory))];
    if (!options.includes(subcategory)) setSubcategory(options[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets, category]);

  // Load available dates whenever the combo changes, default to the latest.
  useEffect(() => {
    if (!category || !subcategory) return;
    setDate('');
    setDates([]);
    api.listAitaRankingDates(category, subcategory)
      .then(list => {
        setDates(list);
        if (list.length > 0) setDate(list[0]);
      })
      .catch(e => setError(e.message || 'Could not load ranking dates'));
  }, [category, subcategory]);

  // Debounce free-text search.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Reset to page 1 whenever the snapshot or search term changes.
  useEffect(() => { setPage(0); }, [category, subcategory, date, search]);

  useEffect(() => {
    if (!category || !subcategory || !date) return;
    setResult(null);
    api.listAitaRankings({ category, subcategory, date, search: search || undefined, page, pageSize: PAGE_SIZE })
      .then(setResult)
      .catch(e => setError(e.message || 'Could not load rankings'));
  }, [category, subcategory, date, search, page]);

  const subcategoryOptions = facets ? [...new Set(facets.filter(f => f.category === category).map(f => f.subcategory))] : [];
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)) : 1;

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.triggerAitaRankingsSync();
      const rows = (result?.summary || []).reduce((sum, s) => sum + (s.rowsUpserted || 0), 0);
      const newDatesCount = (result?.summary || []).reduce((sum, s) => sum + (s.datesUpserted || 0), 0);
      setSyncMessage(newDatesCount > 0 ? `Synced — ${newDatesCount} new date(s), ${rows} rows.` : 'Synced — no new rankings published since last check.');
      if (category && subcategory) {
        api.listAitaRankingDates(category, subcategory).then(list => {
          setDates(list);
          if (list.length > 0 && !list.includes(date)) setDate(list[0]);
        });
      }
    } catch (e) {
      setSyncMessage(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="rankings" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">AITA Rankings</h1>
            <div className="subtitle">MIRRORED FROM AITATENNIS.COM</div>
          </div>
          {isOrganizer && (
            <button className="action-btn primary" onClick={handleSyncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : '⟳ Sync Now'}
            </button>
          )}
        </div>
      </div>

      {syncMessage && <div className="history-empty" style={{ padding: '8px 16px' }}>{syncMessage}</div>}

      {error && <div className="history-empty">{error}</div>}

      {facets && facets.length === 0 && !error && (
        <div className="history-empty">No ranking categories loaded yet.</div>
      )}

      {facets && facets.length > 0 && (
        <>
          <div className="t-week-info-bar">
            <select className="t-badge" style={{ cursor: 'pointer' }} value={category} onChange={e => setCategory(e.target.value)}>
              {[...new Set(facets.map(f => f.category))].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="t-badge" style={{ cursor: 'pointer' }} value={subcategory} onChange={e => setSubcategory(e.target.value)}>
              {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="t-badge" style={{ cursor: 'pointer' }} value={date} onChange={e => setDate(e.target.value)}>
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              type="text"
              placeholder="Search player name…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border,#333)', background: 'transparent', color: 'inherit', fontSize: '0.78rem' }}
            />
            {result && (
              <span className="t-info-item">{result.totalCount} player{result.totalCount === 1 ? '' : 's'}</span>
            )}
          </div>

          <div className="page-scroll">
            {result === null && <div className="history-empty">Loading rankings…</div>}

            {result && result.rows.length === 0 && (
              <div className="history-empty">No players found.</div>
            )}

            {result && result.rows.length > 0 && (
              <>
                <div className="rank-table-wrap">
                  <table className="rank-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Reg No.</th>
                        <th>DOB</th>
                        <th>State</th>
                        <th>Singles</th>
                        <th>Doubles</th>
                        <th>25% Best Dbls</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map(r => (
                        <tr key={r.id}>
                          <td className="rank-cell">{r.rank}</td>
                          <td className="name-cell">{r.playerName}</td>
                          <td>{r.regNo || '—'}</td>
                          <td>{formatDob(r.dob)}</td>
                          <td>{r.state || '—'}</td>
                          <td>{r.pointsBreakdown?.singlesPts ?? '—'}</td>
                          <td>{r.pointsBreakdown?.doublesPts ?? '—'}</td>
                          <td>{r.pointsBreakdown?.best25DoublesPts ?? '—'}</td>
                          <td className="name-cell">{r.totalPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rank-pagination">
                  <button className="action-btn" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</button>
                  <span className="t-info-item">Page {page + 1} of {totalPages}</span>
                  <button className="action-btn" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
