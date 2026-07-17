import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

const CATEGORIES = [
  'Boys Singles', 'Girls Singles', 'Boys Doubles', 'Girls Doubles',
  'Mixed Doubles', 'Men Singles', 'Women Singles', 'Men Doubles', 'Women Doubles',
];
const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet', 'Artificial Grass'];

const EMPTY_FORM = {
  name: '', subtitle: '', category: 'Girls Singles', grade: '',
  location: '', city: '', stateAbbr: '', surface: 'Hard',
  startDate: '', endDate: '', referee: '', tournamentCode: '',
  drawTypes: ['qualifying', 'main'],
};

export default function TournamentsListPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listTournaments()
      .then(list => { if (!cancelled) setTournaments(list); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load tournaments'); });
    return () => { cancelled = true; };
  }, []);

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleDrawType(type) {
    setForm(prev => {
      const has = prev.drawTypes.includes(type);
      return {
        ...prev,
        drawTypes: has
          ? prev.drawTypes.filter(t => t !== type)
          : [...prev.drawTypes, type],
      };
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.category) {
      setSaveError('Name and category are required.');
      return;
    }
    if (form.drawTypes.length === 0) {
      setSaveError('Select at least one draw type.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const created = await api.createTournament(user.id, form);
      setTournaments(prev => [created, ...(prev || [])]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSaveError(err.message || 'Failed to create tournament');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this tournament and all its draw data? This cannot be undone.')) return;
    try {
      await api.deleteTournament(user.id, id);
      setTournaments(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function formatDateRange(start, end) {
    if (!start && !end) return '';
    if (!end) return start;
    return `${start} – ${end}`;
  }

  return (
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Tournaments</h1>
            <div className="subtitle">LIVE EVENTS &amp; DRAW TRACKER</div>
          </div>
          <button className="action-btn primary" onClick={() => { setShowCreate(true); setSaveError(''); }}>
            + Host Event
          </button>
        </div>
      </div>

      {/* Create Tournament Modal */}
      {showCreate && (
        <div className="t-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="t-modal" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">New Tournament</span>
              <button className="drawer-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="t-create-form">
              <div className="t-form-row">
                <div className="field">
                  <label>Tournament Name *</label>
                  <input
                    value={form.name}
                    onChange={e => handleFormChange('name', e.target.value)}
                    placeholder="e.g. SMTA AITA Circuit"
                  />
                </div>
                <div className="field">
                  <label>Subtitle / Series</label>
                  <input
                    value={form.subtitle}
                    onChange={e => handleFormChange('subtitle', e.target.value)}
                    placeholder="e.g. AITA Circuit"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Category *</label>
                  <select value={form.category} onChange={e => handleFormChange('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Grade</label>
                  <input
                    value={form.grade}
                    onChange={e => handleFormChange('grade', e.target.value)}
                    placeholder="e.g. National Serie"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>City</label>
                  <input
                    value={form.city}
                    onChange={e => handleFormChange('city', e.target.value)}
                    placeholder="e.g. Hyderabad"
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <input
                    value={form.stateAbbr}
                    onChange={e => handleFormChange('stateAbbr', e.target.value)}
                    placeholder="e.g. TS"
                    maxLength={4}
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Venue / Location</label>
                  <input
                    value={form.location}
                    onChange={e => handleFormChange('location', e.target.value)}
                    placeholder="Club / facility name"
                  />
                </div>
                <div className="field">
                  <label>Surface</label>
                  <select value={form.surface} onChange={e => handleFormChange('surface', e.target.value)}>
                    {SURFACES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Start Date</label>
                  <input type="date" value={form.startDate} onChange={e => handleFormChange('startDate', e.target.value)} />
                </div>
                <div className="field">
                  <label>End Date</label>
                  <input type="date" value={form.endDate} onChange={e => handleFormChange('endDate', e.target.value)} />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Referee</label>
                  <input
                    value={form.referee}
                    onChange={e => handleFormChange('referee', e.target.value)}
                    placeholder="Referee name"
                  />
                </div>
                <div className="field">
                  <label>Tournament Code</label>
                  <input
                    value={form.tournamentCode}
                    onChange={e => handleFormChange('tournamentCode', e.target.value)}
                    placeholder="e.g. HYD-2026-07"
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: 4 }}>
                <label>Draw Types</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {['qualifying', 'main'].map(type => (
                    <label key={type} className="t-checkbox-label">
                      <input
                        type="checkbox"
                        checked={form.drawTypes.includes(type)}
                        onChange={() => toggleDrawType(type)}
                      />
                      {type.charAt(0).toUpperCase() + type.slice(1)} Draw
                    </label>
                  ))}
                </div>
              </div>

              {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action-btn primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Tournament'}
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

        {tournaments === null && !error && (
          <div className="history-empty">Loading tournaments…</div>
        )}

        {tournaments && tournaments.length === 0 && (
          <div className="history-empty">
            No tournaments yet. Click <strong>+ Host Event</strong> to create the first one.
          </div>
        )}

        {tournaments && tournaments.length > 0 && (
          <div className="t-list">
            {tournaments.map(t => (
              <div key={t.id} className="t-card">
                <Link to={`/tournaments/${t.id}`} className="t-card-main">
                  <div className="t-card-name">{t.name}</div>
                  {t.subtitle && <div className="t-card-sub">{t.subtitle}</div>}
                  <div className="t-card-meta">
                    <span className="t-badge">{t.category}</span>
                    {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
                    {t.surface && <span className="t-badge">{t.surface}</span>}
                  </div>
                  <div className="t-card-location">
                    {[t.city, t.stateAbbr].filter(Boolean).join(', ')}
                    {t.location && ` · ${t.location}`}
                  </div>
                  {(t.startDate || t.endDate) && (
                    <div className="t-card-dates">{formatDateRange(t.startDate, t.endDate)}</div>
                  )}
                  <div className="t-card-draws">
                    {t.drawTypes.map(d => (
                      <span key={d} className="t-draw-chip">
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </span>
                    ))}
                  </div>
                </Link>
                {t.createdBy === user.id && (
                  <button
                    className="t-delete-btn"
                    onClick={() => handleDelete(t.id)}
                    title="Delete tournament"
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
