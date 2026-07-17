import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Boys Singles', 'Girls Singles',
  'Boys Doubles', 'Girls Doubles', 'Mixed Doubles',
  'Men Singles', 'Women Singles',
  'Men Doubles', 'Women Doubles',
];

const AGE_GROUPS = ['U10', 'U12', 'U14', 'U16', 'U18', 'Open'];

const DRAW_SIZES = [4, 8, 16, 32, 64, 128];

const SEED_OPTIONS = [2, 4, 8, 16];

const EMPTY_EVENT_FORM = {
  category: 'Girls Singles',
  ageGroup: 'U14',
  drawSize: 32,
  numSeeds: 4,
  hasQualifying: false,
  qualifyingSize: 32,
  qualifyingSpots: 4,
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }) {
  const labels = {
    setup: 'Setup',
    draw_ready: 'Draw Ready',
    in_progress: 'In Progress',
    complete: 'Complete',
  };
  return (
    <span className={`t-status-badge t-status-${status}`}>
      {labels[status] || status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

function EventCard({ event, weekId, isOwner, onDelete }) {
  return (
    <div className="t-event-card">
      <Link to={`/tournaments/${weekId}/events/${event.id}`} className="t-event-card-main">
        <div className="t-event-card-name">
          {event.category}
          <span className="t-event-age">{event.ageGroup}</span>
        </div>
        <div className="t-event-card-meta">
          <StatusBadge status={event.status} />
          <span className="t-badge">Draw {event.drawSize}</span>
          <span className="t-badge">{event.numSeeds} seeds</span>
          {event.hasQualifying && (
            <span className="t-badge t-badge-qual">Qualifying {event.qualifyingSize}</span>
          )}
        </div>
      </Link>
      {isOwner && (
        <button className="t-delete-btn" onClick={() => onDelete(event.id)} title="Delete event">
          ✕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TournamentDetailPage() {
  const { id: weekId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [week, setWeek] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [form, setForm] = useState(EMPTY_EVENT_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load week + events
  useEffect(() => {
    let cancelled = false;
    api.getTournamentWeek(weekId)
      .then(data => {
        if (!cancelled) {
          setWeek(data);
          setEvents(data.events || []);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load tournament'); });
    return () => { cancelled = true; };
  }, [weekId]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const isDoubles = form.category.includes('Doubles');
      const created = await api.createEvent(weekId, { ...form, isDoubles });
      setEvents(prev => [...prev, created]);
      setShowAddEvent(false);
      setForm(EMPTY_EVENT_FORM);
    } catch (err) {
      setSaveError(err.message || 'Failed to add event');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm('Delete this event and all its draw entries and match data?')) return;
    try {
      await api.deleteEvent(eventId);
      setEvents(prev => prev.filter(ev => ev.id !== eventId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteWeek() {
    if (!window.confirm('Delete this entire tournament week? ALL events, draws, and matches will be permanently removed.')) return;
    try {
      await api.deleteTournamentWeek(user.id, weekId);
      navigate('/tournaments');
    } catch (err) {
      setError(err.message);
    }
  }

  const isOwner = week && user && week.createdBy === user.id;

  if (error) {
    return (
      <div className="root">
        <TopNav />
        <div className="page-scroll">
          <div className="history-empty">{error}</div>
        </div>
      </div>
    );
  }

  if (!week) {
    return (
      <div className="root">
        <TopNav />
        <div className="page-scroll">
          <div className="history-empty">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <div className="t-breadcrumb">
              <Link to="/tournaments">Tournaments</Link>
              <span> / </span>
              <span>{week.name}</span>
            </div>
            <h1 className="title">{week.name}</h1>
            {week.subtitle && <div className="subtitle">{week.subtitle.toUpperCase()}</div>}
          </div>
          {isOwner && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="action-btn primary"
                onClick={() => { setShowAddEvent(true); setSaveError(''); }}
              >
                + Add Event
              </button>
              <button className="action-btn t-danger-btn" onClick={handleDeleteWeek}>
                Delete Week
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Week Info Bar */}
      <div className="t-week-info-bar">
        {week.surface && <span className="t-badge">{week.surface}</span>}
        {week.tournamentCode && <span className="t-badge t-badge-code">{week.tournamentCode}</span>}
        {(week.city || week.stateAbbr) && (
          <span className="t-info-item">
            {[week.city, week.stateAbbr].filter(Boolean).join(', ')}
          </span>
        )}
        {week.location && <span className="t-info-item">{week.location}</span>}
        {(week.startDate || week.endDate) && (
          <span className="t-info-item">
            {week.startDate}{week.endDate && week.endDate !== week.startDate ? ` – ${week.endDate}` : ''}
          </span>
        )}
        {week.numCourts && (
          <span className="t-info-item">{week.numCourts} court{week.numCourts !== 1 ? 's' : ''}</span>
        )}
        {week.referee && <span className="t-info-item">Referee: {week.referee}</span>}
      </div>

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="t-modal-overlay" onClick={() => setShowAddEvent(false)}>
          <div className="t-modal" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">Add Event</span>
              <button className="drawer-close" onClick={() => setShowAddEvent(false)}>✕</button>
            </div>
            <form onSubmit={handleAddEvent} className="t-create-form">
              <div className="t-form-row">
                <div className="field">
                  <label>Category *</label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Age Group *</label>
                  <select value={form.ageGroup} onChange={e => set('ageGroup', e.target.value)}>
                    {AGE_GROUPS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Main Draw Size</label>
                  <select value={form.drawSize} onChange={e => set('drawSize', Number(e.target.value))}>
                    {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Number of Seeds</label>
                  <select value={form.numSeeds} onChange={e => set('numSeeds', Number(e.target.value))}>
                    {SEED_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="t-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.hasQualifying}
                    onChange={e => set('hasQualifying', e.target.checked)}
                  />
                  Has Qualifying Draw
                </label>
              </div>
              {form.hasQualifying && (
                <div className="t-form-row">
                  <div className="field">
                    <label>Qualifying Draw Size</label>
                    <select value={form.qualifyingSize} onChange={e => set('qualifyingSize', Number(e.target.value))}>
                      {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Qualifying Spots (to main draw)</label>
                    <input
                      type="number" min="1" max="16"
                      value={form.qualifyingSpots}
                      onChange={e => set('qualifyingSpots', Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action-btn primary" disabled={saving}>
                  {saving ? 'Adding…' : 'Add Event'}
                </button>
                <button type="button" className="action-btn" onClick={() => setShowAddEvent(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="page-scroll">
        {events.length === 0 ? (
          <div className="history-empty">
            {isOwner
              ? 'No events yet. Click + Add Event to add the first category.'
              : 'No events have been added to this tournament week yet.'}
          </div>
        ) : (
          <div className="t-events-list">
            <div className="t-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Events ({events.length})</span>
              <Link to={`/tournaments/${weekId}/oop`} className="oop-link-btn">
                Order of Play →
              </Link>
            </div>
            {events.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                weekId={weekId}
                isOwner={isOwner}
                onDelete={handleDeleteEvent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
