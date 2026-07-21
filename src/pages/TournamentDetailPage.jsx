import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import { getEntryStage, ENTRY_STAGE } from '../utils/aitaGradeRules';

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
  // Phase 19 — per-category sign-in window & play dates
  signinDate: '',
  signinTime: '',
  firstDayOfPlay: '',
  lastDayOfPlay: '',
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

// Verified against the source PDF's three-stage withdrawal structure — see
// getEntryStage() in aitaGradeRules.js.
const ENTRY_STAGE_LABELS = {
  [ENTRY_STAGE.OPEN]: { text: 'Entries Open', color: '#1a6b3a' },
  [ENTRY_STAGE.ENTRY_CLOSED]: { text: 'Entry Closed', color: '#b8860b' },
  [ENTRY_STAGE.LATE_WITHDRAWAL]: { text: 'Late Withdrawal Only', color: '#c0392b' },
  [ENTRY_STAGE.FROZEN]: { text: 'Frozen — Referee Only', color: '#7a1f1f' },
};

function EntryStageBadge({ stage }) {
  const info = ENTRY_STAGE_LABELS[stage];
  if (!info) return null;
  return (
    <span className="t-badge" style={{ background: info.color, color: '#fff', fontWeight: 600 }}>
      {info.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

function EventCard({ event, weekId, isOwner, onDelete, myEntry, onEnter, onWithdraw, onInvitePartner, entryStage }) {
  const entryOpen = entryStage === ENTRY_STAGE.OPEN;
  const withdrawOpen = entryStage !== ENTRY_STAGE.FROZEN;
  const canEnterSingles = !event.isDoubles && !myEntry && entryOpen;
  const canInviteDoubles = event.isDoubles && !myEntry && entryOpen;
  const isEntered = !!myEntry && myEntry.entryStatus !== 'withdrawn';
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
          {event.signinDate && (
            <span className="t-badge" title="Sign-in">
              Sign-in {event.signinDate}{event.signinTime ? ` ${event.signinTime}` : ''}
            </span>
          )}
          {event.firstDayOfPlay && (
            <span className="t-badge" title="Play dates">
              Play {event.firstDayOfPlay}{event.lastDayOfPlay ? ` – ${event.lastDayOfPlay}` : ''}
            </span>
          )}
        </div>
      </Link>
      {onEnter && isEntered && (
        <button
          className="action-btn"
          style={{ fontSize: 12, padding: '4px 10px', background: 'var(--accent,#1a6b3a)', color: '#fff', opacity: withdrawOpen ? 1 : 0.6 }}
          onClick={withdrawOpen ? () => onWithdraw(event.id) : undefined}
          disabled={!withdrawOpen}
          title={withdrawOpen ? 'Withdraw from this event' : 'Freeze deadline passed — contact the tournament referee to withdraw'}
        >
          ✓ Entered
        </button>
      )}
      {onEnter && canEnterSingles && (
        <button
          className="action-btn"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => onEnter(event)}
          title="Enter this event"
        >
          Enter →
        </button>
      )}
      {onInvitePartner && canInviteDoubles && (
        <button
          className="action-btn"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => onInvitePartner(event)}
          title="Invite a doubles partner"
        >
          + Partner
        </button>
      )}
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
  const [showDetails, setShowDetails] = useState(false); // factsheet panel collapsed by default
  const [form, setForm] = useState(EMPTY_EVENT_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Self-entry state
  const [entryModal, setEntryModal] = useState(null); // { event, placement } | null
  const [myEntries, setMyEntries] = useState({}); // { [eventId]: entry | null }
  const [entryError, setEntryError] = useState('');
  const [enteringSelf, setEnteringSelf] = useState(false);
  // Doubles invitation state
  const [inviteModal, setInviteModal] = useState(null); // { event }
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState([]);
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  // Load week + events
  useEffect(() => {
    let cancelled = false;
    api.getTournamentWeek(weekId)
      .then(async data => {
        if (cancelled) return;
        setWeek(data);
        const evList = data.events || [];
        setEvents(evList);
        // Load my entries for player role
        if (user?.role === 'player' && evList.length > 0) {
          const map = {};
          await Promise.all(evList.map(async ev => {
            try { map[ev.id] = await api.getMyEventEntry(ev.id); }
            catch { map[ev.id] = null; }
          }));
          if (!cancelled) setMyEntries(map);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load tournament'); });
    return () => { cancelled = true; };
  }, [weekId, user?.role]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setSaveError('');
    const duplicate = events.some(
      ev => ev.category === form.category && ev.ageGroup === form.ageGroup
    );
    if (duplicate) {
      setSaveError(`${form.category} ${form.ageGroup} already exists for this tournament.`);
      return;
    }
    setSaving(true);
    try {
      const isDoubles = form.category.includes('Doubles');
      const created = await api.createEvent(weekId, { ...form, isDoubles });
      setEvents(prev => [...prev, created]);
      setShowAddEvent(false);
      setForm(EMPTY_EVENT_FORM);
    } catch (err) {
      const message = /duplicate key value|unique constraint/i.test(err.message)
        ? `${form.category} ${form.ageGroup} already exists for this tournament.`
        : (err.message || 'Failed to add event');
      setSaveError(message);
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
  const isPlayer = user?.role === 'player';
  const entryStage = week ? getEntryStage(week) : ENTRY_STAGE.OPEN;

  async function openEntryModal(event) {
    setEntryError('');
    try {
      const placement = await api.computeSelfEntryPlacement(event.id, user?.ranking || null);
      setEntryModal({ event, placement });
    } catch (err) {
      setEntryError(err.message);
    }
  }

  async function handleSelfEnter() {
    if (!entryModal || enteringSelf) return;
    setEnteringSelf(true);
    setEntryError('');
    try {
      const result = await api.selfEnterSingles(entryModal.event.id, {
        familyName: user.displayName?.split(' ').slice(-1)[0] || user.displayName || '',
        firstName: user.displayName?.split(' ').slice(0, -1).join(' ') || '',
        aitaReg: user.aitaReg || '',
        stateAbbr: user.stateAbbr || '',
        ranking: user.ranking || null,
        dateOfBirth: user.dateOfBirth || '',
        displayName: user.displayName || '',
      });
      setMyEntries(prev => ({ ...prev, [entryModal.event.id]: result.entry }));
      setEntryModal(null);
    } catch (err) {
      setEntryError(err.message);
    } finally {
      setEnteringSelf(false);
    }
  }

  async function handleWithdraw(eventId) {
    const entry = myEntries[eventId];
    if (!entry) return;
    if (!window.confirm('Withdraw from this event?')) return;
    try {
      await api.withdrawFromEvent(entry.id);
      setMyEntries(prev => ({ ...prev, [eventId]: null }));
    } catch (err) {
      setEntryError(err.message);
    }
  }

  async function searchPartners(query) {
    if (!inviteModal || query.length < 2) { setPartnerResults([]); return; }
    const gender = inviteModal.event.category.toLowerCase().includes('girl') || inviteModal.event.category.toLowerCase().includes('women') ? 'F' : 'M';
    try {
      const results = await api.searchDoublesPartners(query, inviteModal.event.ageGroup, gender);
      setPartnerResults(results);
    } catch { setPartnerResults([]); }
  }

  async function handleSendInvitation(partner) {
    if (!inviteModal || !user?.aitaReg) {
      setInviteError(!user?.aitaReg ? 'Set your AITA Reg in Profile first.' : 'No event selected.');
      return;
    }
    setInviting(true);
    setInviteError('');
    try {
      await api.sendDoublesInvitation(inviteModal.event.id, user.aitaReg, partner.aitaReg);
      setInviteModal(null);
      setPartnerQuery('');
      setPartnerResults([]);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  }

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
        {week.grade && <span className="t-badge t-badge-grade">{week.grade}</span>}
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

      {/* Extended details panel — Phase 12 factsheet fields */}
      {(week.directorName || week.entryDeadline || week.qualifyingStartDate ||
        week.venueAddress || week.entryFeeSingles || week.signinInstructions ||
        week.stringingCharges || week.aitaCardRequired || (week.hotelOptions && week.hotelOptions.length > 0)) && (
        <div className="t-factsheet-panel">
          {/* Always-visible summary row */}
          <div className="t-fs-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              <EntryStageBadge stage={entryStage} />
              {week.entryDeadline && <span className="t-fs-item"><b>Entry deadline:</b> {week.entryDeadline}</span>}
              {week.withdrawalDeadline && <span className="t-fs-item"><b>Withdrawal deadline:</b> {week.withdrawalDeadline}</span>}
              {week.freezeDeadline && <span className="t-fs-item"><b>Freeze deadline:</b> {new Date(week.freezeDeadline).toLocaleString()}</span>}
              {(week.qualifyingStartDate || week.qualifyingEndDate) && (
                <span className="t-fs-item">
                  <b>Qualifying:</b> {week.qualifyingStartDate}
                  {week.qualifyingEndDate && week.qualifyingEndDate !== week.qualifyingStartDate ? ` – ${week.qualifyingEndDate}` : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowDetails(v => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--accent,#1a6b3a)', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap', padding: '2px 6px' }}
            >
              {showDetails ? '▲ Less' : '▼ More info'}
            </button>
          </div>

          {/* Collapsible extra detail */}
          {showDetails && (
            <>
              {(week.directorName || week.directorPhone || week.directorEmail) && (
                <div className="t-fs-row">
                  <span className="t-fs-item">
                    <b>Director:</b> {[week.directorName, week.directorPhone, week.directorEmail].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
              {(week.refereePhone || week.refereeEmail) && (
                <div className="t-fs-row">
                  <span className="t-fs-item">
                    <b>Referee contact:</b> {[week.refereePhone, week.refereeEmail].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
              {(week.venueAddress || week.venuePincode || week.venuePhone) && (
                <div className="t-fs-row">
                  <span className="t-fs-item" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto', display: 'block' }}>
                    <b>Venue:</b> {[week.venueAddress, week.venuePincode, week.venuePhone].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {(week.ballBrand || week.hasFloodlights) && (
                <div className="t-fs-row">
                  {week.ballBrand && <span className="t-fs-item"><b>Balls:</b> {week.ballBrand}</span>}
                  {week.hasFloodlights && <span className="t-fs-item">Floodlights available</span>}
                </div>
              )}
              {(week.entryFeeSingles || week.entryFeeDoubles || week.dailyAllowance || week.stringingCharges) && (
                <div className="t-fs-row">
                  {week.entryFeeSingles && <span className="t-fs-item"><b>Singles entry:</b> ₹{week.entryFeeSingles}</span>}
                  {week.entryFeeDoubles && <span className="t-fs-item"><b>Doubles entry:</b> ₹{week.entryFeeDoubles}</span>}
                  {week.dailyAllowance && <span className="t-fs-item"><b>Daily allowance:</b> ₹{week.dailyAllowance}</span>}
                  {week.stringingCharges && <span className="t-fs-item"><b>Stringing:</b> {week.stringingCharges}</span>}
                </div>
              )}
              {week.aitaCardRequired && (
                <div className="t-fs-row">
                  <span className="t-fs-item">AITA registration card required at sign-in</span>
                </div>
              )}
              {week.signinInstructions && (
                <div className="t-fs-row">
                  <span className="t-fs-item" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    <b>Sign-in:</b> {week.signinInstructions}
                  </span>
                </div>
              )}
              {week.hotelOptions && week.hotelOptions.length > 0 && (
                <div className="t-fs-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <span className="t-fs-item"><b>Hotels:</b></span>
                  {week.hotelOptions.map((hotel, idx) => (
                    <span key={idx} className="t-fs-item" style={{ paddingLeft: 12 }}>
                      {hotel.name}
                      {hotel.address ? ` — ${hotel.address}` : ''}
                      {hotel.phone ? ` · ${hotel.phone}` : ''}
                      {hotel.roomRate ? ` · ₹${hotel.roomRate}/night` : ''}
                      {hotel.breakfastIncluded ? ' · breakfast included' : ''}
                      {hotel.distanceToVenue ? ` · ${hotel.distanceToVenue} from venue` : ''}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

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

              {/* Phase 19 — per-category sign-in window & play dates */}
              <div className="t-form-row">
                <div className="field">
                  <label>Sign-in Date</label>
                  <input type="date" value={form.signinDate} onChange={e => set('signinDate', e.target.value)} />
                </div>
                <div className="field">
                  <label>Sign-in Time</label>
                  <input type="time" value={form.signinTime} onChange={e => set('signinTime', e.target.value)} />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>First Day of Play</label>
                  <input type="date" value={form.firstDayOfPlay} onChange={e => set('firstDayOfPlay', e.target.value)} />
                </div>
                <div className="field">
                  <label>Last Day of Play</label>
                  <input type="date" value={form.lastDayOfPlay} onChange={e => set('lastDayOfPlay', e.target.value)} />
                </div>
              </div>

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

      {/* Self-entry confirmation modal */}
      {entryModal && (
        <div className="t-modal-overlay" onClick={() => setEntryModal(null)}>
          <div className="t-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">Confirm Entry</span>
              <button className="drawer-close" onClick={() => setEntryModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>{entryModal.event.category} {entryModal.event.ageGroup}</strong>
              </p>
              <p style={{ margin: '0 0 4px' }}>Your AITA rank: <strong>{user?.ranking || 'Unranked'}</strong></p>
              <p style={{ margin: '0 0 4px' }}>
                Placement:{' '}
                {entryModal.placement.isAlternate
                  ? <span style={{ color: '#f59e0b' }}>Alternate (draw is full)</span>
                  : entryModal.placement.drawType === 'main'
                    ? <span style={{ color: '#22c55e' }}>Main Draw — position {entryModal.placement.position}</span>
                    : <span style={{ color: '#60a5fa' }}>Qualifying Draw — position {entryModal.placement.position}</span>
                }
              </p>
            </div>
            {entryError && <div className="login-error" style={{ marginBottom: 8 }}>{entryError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="action-btn primary" onClick={handleSelfEnter} disabled={enteringSelf}>
                {enteringSelf ? 'Entering…' : 'Confirm Entry'}
              </button>
              <button className="action-btn" onClick={() => { setEntryModal(null); setEntryError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {entryError && !entryModal && (
        <div style={{ margin: '0 16px 8px', color: '#ef4444', fontSize: 13 }}>{entryError}</div>
      )}

      {/* Doubles invitation modal */}
      {inviteModal && (
        <div className="t-modal-overlay" onClick={() => { setInviteModal(null); setPartnerQuery(''); setPartnerResults([]); setInviteError(''); }}>
          <div className="t-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">Invite Doubles Partner</span>
              <button className="drawer-close" onClick={() => { setInviteModal(null); setPartnerQuery(''); setPartnerResults([]); setInviteError(''); }}>✕</button>
            </div>
            <p style={{ fontSize: 13, margin: '0 0 10px', color: 'var(--text2,#888)' }}>
              {inviteModal.event.category} {inviteModal.event.ageGroup} — search for a partner by name or AITA Reg.
            </p>
            <input
              className="t-search-input"
              style={{ width: '100%', marginBottom: 8 }}
              placeholder="Search by name or AITA Reg…"
              value={partnerQuery}
              autoFocus
              onChange={e => { setPartnerQuery(e.target.value); searchPartners(e.target.value); }}
            />
            {partnerResults.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border,#333)', borderRadius: 6 }}>
                {partnerResults.map(p => (
                  <div
                    key={p.aitaReg}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border,#222)', cursor: 'pointer' }}
                    onClick={() => handleSendInvitation(p)}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.familyName}{p.firstName ? `, ${p.firstName}` : ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2,#888)' }}>{p.aitaReg} · {p.state} · {p.rankingRank ? `Rank ${p.rankingRank}` : 'Unranked'}</div>
                    </div>
                    <button className="action-btn primary" style={{ fontSize: 12, padding: '3px 10px' }} disabled={inviting}>
                      {inviting ? '…' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {inviteError && <div className="login-error" style={{ marginTop: 8 }}>{inviteError}</div>}
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
                myEntry={isPlayer ? myEntries[ev.id] : undefined}
                onEnter={isPlayer ? openEntryModal : undefined}
                onWithdraw={isPlayer ? handleWithdraw : undefined}
                onInvitePartner={isPlayer ? (event) => { setInviteModal({ event }); setPartnerQuery(''); setPartnerResults([]); setInviteError(''); } : undefined}
                entryStage={entryStage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
