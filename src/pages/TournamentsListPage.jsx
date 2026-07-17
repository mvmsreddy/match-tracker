import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet', 'Artificial Grass'];
const STATES = ['AP','TS','MH','KA','TN','KL','DL','UP','WB','GJ','RJ','MP','PB','HR','UK','HP','JK','OD','AS','MN','NL','SK','TR','MZ','AR','GA','JH','CG','BR','BH'];

const EMPTY_FORM = {
  name: '', subtitle: '', tournamentCode: '',
  location: '', city: '', stateAbbr: '', surface: 'Hard',
  startDate: '', endDate: '', referee: '',
  numCourts: 2, dayStartTime: '09:00',
};

function formatDateRange(start, end) {
  if (!start && !end) return '';
  if (!end) return start;
  return `${start} – ${end}`;
}

export default function TournamentsListPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listTournamentWeeks()
      .then(list => { if (!cancelled) setWeeks(list); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load tournaments'); });
    return () => { cancelled = true; };
  }, []);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) { setSaveError('Tournament name is required.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const created = await api.createTournamentWeek(user.id, {
        ...form,
        numCourts: Number(form.numCourts) || 1,
        dayStartTime: form.dayStartTime + ':00',
      });
      setWeeks(prev => [{ ...created, eventCount: 0 }, ...(prev || [])]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSaveError(err.message || 'Failed to create tournament');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this tournament week and ALL events, draws, and matches inside it? This cannot be undone.')) return;
    try {
      await api.deleteTournamentWeek(user.id, id);
      setWeeks(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  const isOrganizer = user?.role === 'organizer';

  return (
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Tournaments</h1>
            <div className="subtitle">LIVE EVENTS &amp; DRAW TRACKER</div>
          </div>
          {isOrganizer && (
            <button className="action-btn primary" onClick={() => { setShowCreate(true); setSaveError(''); }}>
              + New Tournament Week
            </button>
          )}
        </div>
      </div>

      {/* Create Week Modal */}
      {showCreate && (
        <div className="t-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="t-modal" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">New Tournament Week</span>
              <button className="drawer-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="t-create-form">
              <div className="t-form-row">
                <div className="field">
                  <label>Tournament Name *</label>
                  <input
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. SMTA AITA Circuit"
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Subtitle / Series</label>
                  <input
                    value={form.subtitle}
                    onChange={e => set('subtitle', e.target.value)}
                    placeholder="e.g. AITA Circuit"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Tournament Code</label>
                  <input
                    value={form.tournamentCode}
                    onChange={e => set('tournamentCode', e.target.value)}
                    placeholder="e.g. HYD-2026-07"
                  />
                </div>
                <div className="field">
                  <label>Surface</label>
                  <select value={form.surface} onChange={e => set('surface', e.target.value)}>
                    {SURFACES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>City</label>
                  <input
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                    placeholder="e.g. Hyderabad"
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <select value={form.stateAbbr} onChange={e => set('stateAbbr', e.target.value)}>
                    <option value="">— State —</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Venue / Facility</label>
                  <input
                    value={form.location}
                    onChange={e => set('location', e.target.value)}
                    placeholder="Club / sports complex"
                  />
                </div>
                <div className="field">
                  <label>Referee</label>
                  <input
                    value={form.referee}
                    onChange={e => set('referee', e.target.value)}
                    placeholder="Referee name"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Start Date</label>
                  <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                </div>
                <div className="field">
                  <label>End Date</label>
                  <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Number of Courts</label>
                  <input
                    type="number" min="1" max="20"
                    value={form.numCourts}
                    onChange={e => set('numCourts', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Day Start Time</label>
                  <input
                    type="time"
                    value={form.dayStartTime}
                    onChange={e => set('dayStartTime', e.target.value)}
                  />
                </div>
              </div>

              {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action-btn primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Tournament Week'}
                </button>
                <button type="button" className="action-btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}

        {weeks === null && !error && (
          <div className="history-empty">Loading tournaments…</div>
        )}

        {weeks && weeks.length === 0 && (
          <div className="history-empty">
            {isOrganizer
              ? 'No tournament weeks yet. Click + New Tournament Week to create one.'
              : 'No tournaments are currently scheduled.'}
          </div>
        )}

        {weeks && weeks.length > 0 && (
          <div className="t-list">
            {weeks.map(w => (
              <div key={w.id} className="t-card">
                <Link to={`/tournaments/${w.id}`} className="t-card-main">
                  <div className="t-card-name">{w.name}</div>
                  {w.subtitle && <div className="t-card-sub">{w.subtitle}</div>}
                  <div className="t-card-meta">
                    {w.surface && <span className="t-badge">{w.surface}</span>}
                    {w.tournamentCode && <span className="t-badge t-badge-code">{w.tournamentCode}</span>}
                    <span className="t-badge t-badge-events">
                      {w.eventCount !== undefined ? `${w.eventCount} event${w.eventCount !== 1 ? 's' : ''}` : ''}
                    </span>
                  </div>
                  <div className="t-card-location">
                    {[w.city, w.stateAbbr].filter(Boolean).join(', ')}
                    {w.location && ` · ${w.location}`}
                  </div>
                  {(w.startDate || w.endDate) && (
                    <div className="t-card-dates">{formatDateRange(w.startDate, w.endDate)}</div>
                  )}
                  {w.numCourts && (
                    <div className="t-card-courts">{w.numCourts} court{w.numCourts !== 1 ? 's' : ''}</div>
                  )}
                </Link>
                {w.createdBy === user?.id && (
                  <button
                    className="t-delete-btn"
                    onClick={() => handleDelete(w.id)}
                    title="Delete tournament week"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
