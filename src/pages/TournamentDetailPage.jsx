import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { getEntryStage, ENTRY_STAGE } from '../utils/aitaGradeRules';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '../lib/utils';

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

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9 w-full';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  setup: 'bg-muted text-muted-foreground',
  draw_ready: 'bg-primary/10 text-primary',
  in_progress: 'bg-chart-2/15 text-chart-2',
  complete: 'bg-chart-3/15 text-chart-3',
};

function StatusBadge({ status }) {
  const labels = {
    setup: 'Setup',
    draw_ready: 'Draw Ready',
    in_progress: 'In Progress',
    complete: 'Complete',
  };
  return (
    <span className={cn('inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-semibold', STATUS_STYLES[status] || 'bg-muted text-muted-foreground')}>
      {labels[status] || status}
    </span>
  );
}

// Verified against the source PDF's three-stage withdrawal structure — see
// getEntryStage() in aitaGradeRules.js.
const ENTRY_STAGE_STYLES = {
  [ENTRY_STAGE.OPEN]: 'bg-chart-3/15 text-chart-3',
  [ENTRY_STAGE.ENTRY_CLOSED]: 'bg-chart-2/15 text-chart-2',
  [ENTRY_STAGE.LATE_WITHDRAWAL]: 'bg-destructive/15 text-destructive',
  [ENTRY_STAGE.FROZEN]: 'bg-destructive/25 text-destructive',
};
const ENTRY_STAGE_LABELS = {
  [ENTRY_STAGE.OPEN]: 'Entries Open',
  [ENTRY_STAGE.ENTRY_CLOSED]: 'Entry Closed',
  [ENTRY_STAGE.LATE_WITHDRAWAL]: 'Late Withdrawal Only',
  [ENTRY_STAGE.FROZEN]: 'Frozen — Referee Only',
};

function EntryStageBadge({ stage }) {
  const label = ENTRY_STAGE_LABELS[stage];
  if (!label) return null;
  return (
    <span className={cn('inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-bold', ENTRY_STAGE_STYLES[stage])}>
      {label}
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
    <div className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary">
      <Link to={`/tournaments/${weekId}/events/${event.id}`} className="flex-1 min-w-0">
        <div className="text-sm font-bold">
          {event.category} <span className="text-muted-foreground font-normal">{event.ageGroup}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <StatusBadge status={event.status} />
          <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">Draw {event.drawSize}</span>
          <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{event.numSeeds} seeds</span>
          {event.hasQualifying && (
            <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">Qualifying {event.qualifyingSize}</span>
          )}
          {event.signinDate && (
            <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold" title="Sign-in">
              Sign-in {event.signinDate}{event.signinTime ? ` ${event.signinTime}` : ''}
            </span>
          )}
          {event.firstDayOfPlay && (
            <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold" title="Play dates">
              Play {event.firstDayOfPlay}{event.lastDayOfPlay ? ` – ${event.lastDayOfPlay}` : ''}
            </span>
          )}
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {onEnter && isEntered && (
          <Button
            size="sm"
            className="bg-chart-3 text-white hover:bg-chart-3/90 disabled:opacity-60"
            onClick={withdrawOpen ? () => onWithdraw(event.id) : undefined}
            disabled={!withdrawOpen}
            title={withdrawOpen ? 'Withdraw from this event' : 'Freeze deadline passed — contact the tournament referee to withdraw'}
          >
            ✓ Entered
          </Button>
        )}
        {onEnter && canEnterSingles && (
          <Button size="sm" variant="outline" onClick={() => onEnter(event)} title="Enter this event">Enter →</Button>
        )}
        {onInvitePartner && canInviteDoubles && (
          <Button size="sm" variant="outline" onClick={() => onInvitePartner(event)} title="Invite a doubles partner">+ Partner</Button>
        )}
        {isOwner && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(event.id)} title="Delete event">✕</Button>
        )}
      </div>
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
        gender: user.gender || '',
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
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!week) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Link to="/tournaments" className="hover:text-foreground">Tournaments</Link>
            <span>/</span>
            <span className="text-foreground">{week.name}</span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">{week.name}</h1>
          {week.subtitle && <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{week.subtitle}</div>}
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Button onClick={() => { setShowAddEvent(true); setSaveError(''); }}>+ Add Event</Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDeleteWeek}>Delete Week</Button>
          </div>
        )}
      </div>

      {/* Week Info Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {week.surface && <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{week.surface}</span>}
        {week.grade && <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{week.grade}</span>}
        {week.tournamentCode && <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{week.tournamentCode}</span>}
        {(week.city || week.stateAbbr) && (
          <span className="text-xs text-muted-foreground">{[week.city, week.stateAbbr].filter(Boolean).join(', ')}</span>
        )}
        {week.location && <span className="text-xs text-muted-foreground">{week.location}</span>}
        {(week.startDate || week.endDate) && (
          <span className="text-xs text-muted-foreground">
            {week.startDate}{week.endDate && week.endDate !== week.startDate ? ` – ${week.endDate}` : ''}
          </span>
        )}
        {week.numCourts && <span className="text-xs text-muted-foreground">{week.numCourts} court{week.numCourts !== 1 ? 's' : ''}</span>}
        {week.referee && <span className="text-xs text-muted-foreground">Referee: {week.referee}</span>}
      </div>

      {/* Extended details panel — Phase 12 factsheet fields */}
      {(week.directorName || week.entryDeadline || week.qualifyingStartDate ||
        week.venueAddress || week.entryFeeSingles || week.signinInstructions ||
        week.stringingCharges || week.aitaCardRequired || (week.hotelOptions && week.hotelOptions.length > 0)) && (
        <div className="rounded-sm border border-border bg-card p-3">
          {/* Always-visible summary row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <EntryStageBadge stage={entryStage} />
              {week.entryDeadline && <span className="text-xs text-muted-foreground"><b className="text-foreground">Entry deadline:</b> {week.entryDeadline}</span>}
              {week.withdrawalDeadline && <span className="text-xs text-muted-foreground"><b className="text-foreground">Withdrawal deadline:</b> {week.withdrawalDeadline}</span>}
              {week.freezeDeadline && <span className="text-xs text-muted-foreground"><b className="text-foreground">Freeze deadline:</b> {new Date(week.freezeDeadline).toLocaleString()}</span>}
              {(week.qualifyingStartDate || week.qualifyingEndDate) && (
                <span className="text-xs text-muted-foreground">
                  <b className="text-foreground">Qualifying:</b> {week.qualifyingStartDate}
                  {week.qualifyingEndDate && week.qualifyingEndDate !== week.qualifyingStartDate ? ` – ${week.qualifyingEndDate}` : ''}
                </span>
              )}
            </div>
            <button onClick={() => setShowDetails(v => !v)} className="bg-transparent text-primary text-xs whitespace-nowrap px-1.5">
              {showDetails ? '▲ Less' : '▼ More info'}
            </button>
          </div>

          {/* Collapsible extra detail */}
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs text-muted-foreground">
              {(week.directorName || week.directorPhone || week.directorEmail) && (
                <div><b className="text-foreground">Director:</b> {[week.directorName, week.directorPhone, week.directorEmail].filter(Boolean).join(' · ')}</div>
              )}
              {(week.refereePhone || week.refereeEmail) && (
                <div><b className="text-foreground">Referee contact:</b> {[week.refereePhone, week.refereeEmail].filter(Boolean).join(' · ')}</div>
              )}
              {(week.venueAddress || week.venuePincode || week.venuePhone) && (
                <div className="break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                  <b className="text-foreground">Venue:</b> {[week.venueAddress, week.venuePincode, week.venuePhone].filter(Boolean).join(', ')}
                </div>
              )}
              {(week.ballBrand || week.hasFloodlights) && (
                <div className="flex flex-wrap gap-3">
                  {week.ballBrand && <span><b className="text-foreground">Balls:</b> {week.ballBrand}</span>}
                  {week.hasFloodlights && <span>Floodlights available</span>}
                </div>
              )}
              {(week.entryFeeSingles || week.entryFeeDoubles || week.dailyAllowance || week.stringingCharges) && (
                <div className="flex flex-wrap gap-3">
                  {week.entryFeeSingles && <span><b className="text-foreground">Singles entry:</b> ₹{week.entryFeeSingles}</span>}
                  {week.entryFeeDoubles && <span><b className="text-foreground">Doubles entry:</b> ₹{week.entryFeeDoubles}</span>}
                  {week.dailyAllowance && <span><b className="text-foreground">Daily allowance:</b> ₹{week.dailyAllowance}</span>}
                  {week.stringingCharges && <span><b className="text-foreground">Stringing:</b> {week.stringingCharges}</span>}
                </div>
              )}
              {week.aitaCardRequired && <div>AITA registration card required at sign-in</div>}
              {week.signinInstructions && (
                <div className="break-words whitespace-pre-wrap"><b className="text-foreground">Sign-in:</b> {week.signinInstructions}</div>
              )}
              {week.hotelOptions && week.hotelOptions.length > 0 && (
                <div className="space-y-1">
                  <div><b className="text-foreground">Hotels:</b></div>
                  {week.hotelOptions.map((hotel, idx) => (
                    <div key={idx} className="pl-3">
                      {hotel.name}
                      {hotel.address ? ` — ${hotel.address}` : ''}
                      {hotel.phone ? ` · ${hotel.phone}` : ''}
                      {hotel.roomRate ? ` · ₹${hotel.roomRate}/night` : ''}
                      {hotel.breakfastIncluded ? ' · breakfast included' : ''}
                      {hotel.distanceToVenue ? ` · ${hotel.distanceToVenue} from venue` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddEvent(false)}>
          <div className="bg-card border border-border rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <span className="text-lg font-display font-extrabold tracking-tight">Add Event</span>
              <button onClick={() => setShowAddEvent(false)} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
            </div>
            <form onSubmit={handleAddEvent} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Category *">
                  <select className={selectCls} value={form.category} onChange={e => set('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Age Group *">
                  <select className={selectCls} value={form.ageGroup} onChange={e => set('ageGroup', e.target.value)}>
                    {AGE_GROUPS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Main Draw Size">
                  <select className={selectCls} value={form.drawSize} onChange={e => set('drawSize', Number(e.target.value))}>
                    {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Number of Seeds">
                  <select className={selectCls} value={form.numSeeds} onChange={e => set('numSeeds', Number(e.target.value))}>
                    {SEED_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-primary" checked={form.hasQualifying} onChange={e => set('hasQualifying', e.target.checked)} />
                Has Qualifying Draw
              </label>
              {form.hasQualifying && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Qualifying Draw Size">
                    <select className={selectCls} value={form.qualifyingSize} onChange={e => set('qualifyingSize', Number(e.target.value))}>
                      {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Qualifying Spots (to main draw)">
                    <Input type="number" min="1" max="16" value={form.qualifyingSpots} onChange={e => set('qualifyingSpots', Number(e.target.value))} />
                  </Field>
                </div>
              )}

              {/* Phase 19 — per-category sign-in window & play dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Sign-in Date"><Input type="date" value={form.signinDate} onChange={e => set('signinDate', e.target.value)} /></Field>
                <Field label="Sign-in Time"><Input type="time" value={form.signinTime} onChange={e => set('signinTime', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="First Day of Play"><Input type="date" value={form.firstDayOfPlay} onChange={e => set('firstDayOfPlay', e.target.value)} /></Field>
                <Field label="Last Day of Play"><Input type="date" value={form.lastDayOfPlay} onChange={e => set('lastDayOfPlay', e.target.value)} /></Field>
              </div>

              {saveError && <div className="text-sm text-destructive">{saveError}</div>}

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Event'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Self-entry confirmation modal */}
      {entryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEntryModal(null)}>
          <div className="bg-card border border-border rounded-sm max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <span className="text-lg font-display font-extrabold tracking-tight">Confirm Entry</span>
              <button onClick={() => setEntryModal(null)} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
            </div>
            <div className="text-sm leading-relaxed space-y-1.5 mb-4">
              <p className="font-bold">{entryModal.event.category} {entryModal.event.ageGroup}</p>
              <p>Your AITA rank: <strong>{user?.ranking || 'Unranked'}</strong></p>
              <p>
                Placement:{' '}
                {entryModal.placement.isAlternate
                  ? <span className="text-chart-2 font-semibold">Alternate (draw is full)</span>
                  : entryModal.placement.drawType === 'main'
                    ? <span className="text-chart-3 font-semibold">Main Draw — position {entryModal.placement.position}</span>
                    : <span className="text-primary font-semibold">Qualifying Draw — position {entryModal.placement.position}</span>
                }
              </p>
            </div>
            {entryError && <div className="text-sm text-destructive mb-2">{entryError}</div>}
            <div className="flex gap-2">
              <Button onClick={handleSelfEnter} disabled={enteringSelf}>{enteringSelf ? 'Entering…' : 'Confirm Entry'}</Button>
              <Button variant="outline" onClick={() => { setEntryModal(null); setEntryError(''); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {entryError && !entryModal && <div className="text-sm text-destructive">{entryError}</div>}

      {/* Doubles invitation modal */}
      {inviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setInviteModal(null); setPartnerQuery(''); setPartnerResults([]); setInviteError(''); }}>
          <div className="bg-card border border-border rounded-sm max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <span className="text-lg font-display font-extrabold tracking-tight">Invite Doubles Partner</span>
              <button onClick={() => { setInviteModal(null); setPartnerQuery(''); setPartnerResults([]); setInviteError(''); }} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {inviteModal.event.category} {inviteModal.event.ageGroup} — search for a partner by name or AITA Reg.
            </p>
            <Input
              className="mb-2"
              placeholder="Search by name or AITA Reg…"
              value={partnerQuery}
              autoFocus
              onChange={e => { setPartnerQuery(e.target.value); searchPartners(e.target.value); }}
            />
            {partnerResults.length > 0 && (
              <div className="max-h-56 overflow-y-auto border border-border rounded-sm divide-y divide-border">
                {partnerResults.map(p => (
                  <div
                    key={p.aitaReg}
                    className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-secondary"
                    onClick={() => handleSendInvitation(p)}
                  >
                    <div>
                      <div className="text-sm font-bold">{p.familyName}{p.firstName ? `, ${p.firstName}` : ''}</div>
                      <div className="text-xs text-muted-foreground">{p.aitaReg} · {p.state} · {p.rankingRank ? `Rank ${p.rankingRank}` : 'Unranked'}</div>
                    </div>
                    <Button size="sm" disabled={inviting}>{inviting ? '…' : 'Invite'}</Button>
                  </div>
                ))}
              </div>
            )}
            {inviteError && <div className="text-sm text-destructive mt-2">{inviteError}</div>}
          </div>
        </div>
      )}

      {/* Events list */}
      {events.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {isOwner
            ? 'No events yet. Click + Add Event to add the first category.'
            : 'No events have been added to this tournament week yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Events ({events.length})</span>
            <Link to={`/tournaments/${weekId}/oop`} className="text-sm text-primary hover:underline">Order of Play →</Link>
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
  );
}
