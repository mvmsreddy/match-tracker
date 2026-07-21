import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import { parseFactsheetPdf } from '../utils/parseFactsheet';
import { getAitaDrawDefaults, mainDrawComposition, qualifyingDrawComposition, seedCountForDraw, DOUBLES_NUM_SEEDS } from '../utils/aitaGradeRules';

const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet', 'Artificial Grass'];
const STATES = ['AP','TS','MH','KA','TN','KL','DL','UP','WB','GJ','RJ','MP','PB','HR','UK','HP','JK','OD','AS','MN','NL','SK','TR','MZ','AR','GA','JH','CG','BR','BH'];
const GRADES = ['National Series', 'Super Series', 'Championship Series (7-Day)', 'Championship Series (3-Day)', 'Talent Series', 'Nationals', 'State', 'ITF Grade 1', 'ITF Grade 2', 'ITF Grade 3', 'ITF Grade 4', 'ITF Grade 5', 'Satellite'];
const CATEGORIES = ['Boys Singles', 'Girls Singles', 'Boys Doubles', 'Girls Doubles', 'Mixed Doubles', 'Men Singles', 'Women Singles', 'Men Doubles', 'Women Doubles'];
const AGE_GROUPS = ['U10', 'U12', 'U14', 'U16', 'U18', 'Open'];
const DRAW_SIZES = [4, 8, 16, 32, 48, 64, 128];

// AITA draw defaults by grade + category — verified against the source PDF
// (see src/utils/aitaGradeRules.js). Also attaches maxMainDirect/maxQualDirect
// so the acceptance-list composition (direct/qualifiers/special-exempt/wild-card
// split) is set at creation time instead of only being backfilled later.
function getDrawDefaults(grade, category) {
  const d = getAitaDrawDefaults(grade, category);
  const mainComp = mainDrawComposition(d.drawSize);
  const qualComp = d.hasQualifying ? qualifyingDrawComposition(d.qualifyingSize) : null;
  return {
    ...d,
    maxMainDirect: mainComp ? mainComp.directAcceptance : null,
    maxQualDirect: qualComp ? qualComp.directAcceptance : null,
  };
}

const EMPTY_FORM = {
  name: '', subtitle: '', tournamentCode: '',
  location: '', city: '', stateAbbr: '', surface: 'Hard',
  startDate: '', endDate: '', referee: '',
  numCourts: 2, dayStartTime: '09:00',
  // Phase 12 — optional factsheet fields
  grade: '',
  entryDeadline: '', withdrawalDeadline: '', freezeDeadline: '',
  qualifyingStartDate: '', qualifyingEndDate: '',
  directorName: '', directorPhone: '', directorEmail: '',
  refereePhone: '', refereeEmail: '',
  venueAddress: '', venuePincode: '', venuePhone: '',
  ballBrand: '', hasFloodlights: false,
  entryFeeSingles: '', entryFeeDoubles: '', dailyAllowance: '',
  signinInstructions: '',
  // Phase 19 — organiser extra fields
  stringingCharges: '', aitaCardRequired: false, hotelOptions: [],
};

const EMPTY_HOTEL = { name: '', address: '', phone: '', roomRate: '', breakfastIncluded: false, distanceToVenue: '' };

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
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [parsedFromPdf, setParsedFromPdf] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const pdfInputRef = useRef(null);
  // Step 2: event rows
  const [step, setStep] = useState(1);
  const [eventRows, setEventRows] = useState([]);

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

  function closeModal() {
    setShowCreate(false);
    setParsedFromPdf(false);
    setStep(1);
    setEventRows([]);
    setSaveError('');
    setForm(EMPTY_FORM);
  }

  // Step 1 → 2: validate name, advance
  function handleStep1(e) {
    e.preventDefault();
    if (!form.name.trim()) { setSaveError('Tournament name is required.'); return; }
    setSaveError('');
    setStep(2);
  }

  // Step 2: create tournament week + all event rows
  async function handleSubmitAll() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const created = await api.createTournamentWeek(user.id, {
        ...form,
        numCourts: Number(form.numCourts) || 1,
        dayStartTime: form.dayStartTime + ':00',
      });
      const validRows = eventRows.filter(r => r.category && r.ageGroup);
      const seen = new Set();
      const uniqueRows = validRows.filter(r => {
        const key = `${r.category}|${r.ageGroup}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const ev of uniqueRows) {
        await api.createEvent(created.id, ev);
      }
      setWeeks(prev => [{ ...created, eventCount: uniqueRows.length }, ...(prev || [])]);
      closeModal();
    } catch (err) {
      const message = /duplicate key value|unique constraint/i.test(err.message)
        ? 'Two events have the same category and age group — each combination can only be added once.'
        : (err.message || 'Failed to create tournament');
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  function addHotelRow() {
    setForm(prev => ({ ...prev, hotelOptions: [...prev.hotelOptions, { ...EMPTY_HOTEL }] }));
  }

  function removeHotelRow(idx) {
    setForm(prev => ({ ...prev, hotelOptions: prev.hotelOptions.filter((_, i) => i !== idx) }));
  }

  function updateHotelRow(idx, field, value) {
    setForm(prev => ({
      ...prev,
      hotelOptions: prev.hotelOptions.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    }));
  }

  function addEventRow() {
    const defaults = getDrawDefaults(form.grade, 'Boys Singles');
    setEventRows(prev => [...prev, { category: 'Boys Singles', ageGroup: 'U14', ...defaults }]);
  }

  function removeEventRow(idx) {
    setEventRows(prev => prev.filter((_, i) => i !== idx));
  }

  function updateEventRow(idx, field, value) {
    setEventRows(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      if (field === 'category') {
        return { ...updated, ...getDrawDefaults(form.grade, value) };
      }
      if (field === 'drawSize') {
        const isDoubles = /double/i.test(row.category || '');
        updated.numSeeds = isDoubles ? DOUBLES_NUM_SEEDS : seedCountForDraw(Number(value));
        const comp = mainDrawComposition(Number(value));
        updated.maxMainDirect = comp ? comp.directAcceptance : null;
      }
      if (field === 'qualifyingSize') {
        const comp = qualifyingDrawComposition(Number(value));
        updated.maxQualDirect = comp ? comp.directAcceptance : null;
      }
      return updated;
    }));
  }

  async function handlePdfUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const parsed = await parseFactsheetPdf(file);
      setForm(prev => ({ ...prev, ...parsed }));
      setParsedFromPdf(true);
      setShowMore(true); // expand details so user can review everything
      setStep(1);
      setEventRows([]);
      setShowCreate(true);
    } catch (err) {
      setParseError('Could not read PDF: ' + (err.message || 'unknown error'));
    } finally {
      setParsing(false);
      e.target.value = ''; // reset so same file can be re-uploaded
    }
  }

  function openCreateManual() {
    setForm(EMPTY_FORM);
    setParsedFromPdf(false);
    setParseError('');
    setSaveError('');
    setShowMore(false);
    setStep(1);
    setEventRows([]);
    setShowCreate(true);
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
  const isPlayer = user?.role === 'player';
  const missingPlayerFields = isPlayer
    ? [!user?.aitaReg && 'AITA Reg', !user?.dateOfBirth && 'Date of Birth', !user?.stateAbbr && 'State'].filter(Boolean)
    : [];

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="action-btn primary"
                onClick={() => { pdfInputRef.current?.click(); setParseError(''); }}
                disabled={parsing}
                title="Upload AITA Factsheet PDF to auto-fill the form"
              >
                {parsing ? 'Reading PDF…' : '⬆ Upload Factsheet PDF'}
              </button>
              <button className="action-btn" onClick={openCreateManual}>
                + Create Manually
              </button>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={handlePdfUpload}
              />
            </div>
          )}
          {parseError && (
            <div className="login-error" style={{ marginTop: 6, fontSize: 13 }}>{parseError}</div>
          )}
        </div>
      </div>

      {/* Create Week Modal */}
      {showCreate && (
        <div className="t-modal-overlay" onClick={closeModal}>
          <div className="t-modal" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">
                {step === 2 ? `Add Events — ${form.name}` : parsedFromPdf ? 'Review Tournament Details' : 'New Tournament Week'}
              </span>
              <button className="drawer-close" onClick={closeModal}>✕</button>
            </div>
            {step === 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span style={{ background: 'var(--accent,#1a6b3a)', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>1 · Tournament Details</span>
                <span style={{ background: 'var(--surface2,#2a2a2a)', color: 'var(--text2,#888)', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>2 · Add Events</span>
              </div>
            )}
            {step === 2 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span style={{ background: 'var(--surface2,#2a2a2a)', color: 'var(--text2,#888)', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>1 · Tournament Details</span>
                <span style={{ background: 'var(--accent,#1a6b3a)', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>2 · Add Events</span>
              </div>
            )}

            {parsedFromPdf && step === 1 && (
              <div style={{
                background: 'var(--accent, #1a6b3a)', color: '#fff',
                borderRadius: 6, padding: '8px 12px', margin: '0 0 12px',
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✓ Auto-filled from Factsheet PDF — review and edit before submitting</span>
                <button
                  type="button"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}
                  onClick={() => setParsedFromPdf(false)}
                  title="Dismiss"
                >✕</button>
              </div>
            )}

            {step === 1 && <form onSubmit={handleStep1} className="t-create-form">
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

              {/* ── More Details (optional / Phase 12) ───────────────────── */}
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <button
                  type="button"
                  className="action-btn"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setShowMore(v => !v)}
                >
                  {showMore ? '▲ Hide Details' : '▼ More Details (optional)'}
                </button>
              </div>

              {showMore && (
                <>
                  {/* Classification */}
                  <div className="t-form-row" style={{ marginTop: 10 }}>
                    <div className="field">
                      <label>Grade / Series</label>
                      <select value={form.grade} onChange={e => set('grade', e.target.value)}>
                        <option value="">— select —</option>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Deadlines */}
                  <div className="t-form-row">
                    <div className="field">
                      <label>Entry Deadline</label>
                      <input type="date" value={form.entryDeadline} onChange={e => set('entryDeadline', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Withdrawal Deadline</label>
                      <input type="date" value={form.withdrawalDeadline} onChange={e => set('withdrawalDeadline', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Freeze Deadline</label>
                      <input type="datetime-local" value={form.freezeDeadline} onChange={e => set('freezeDeadline', e.target.value)} />
                    </div>
                  </div>

                  {/* Qualifying dates */}
                  <div className="t-form-row">
                    <div className="field">
                      <label>Qualifying Start Date</label>
                      <input type="date" value={form.qualifyingStartDate} onChange={e => set('qualifyingStartDate', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Qualifying End Date</label>
                      <input type="date" value={form.qualifyingEndDate} onChange={e => set('qualifyingEndDate', e.target.value)} />
                    </div>
                  </div>

                  {/* Officials */}
                  <div className="t-form-row">
                    <div className="field">
                      <label>Tournament Director</label>
                      <input value={form.directorName} onChange={e => set('directorName', e.target.value)} placeholder="Director name" />
                    </div>
                    <div className="field">
                      <label>Director Phone</label>
                      <input value={form.directorPhone} onChange={e => set('directorPhone', e.target.value)} placeholder="+91 …" />
                    </div>
                  </div>
                  <div className="t-form-row">
                    <div className="field">
                      <label>Director Email</label>
                      <input type="email" value={form.directorEmail} onChange={e => set('directorEmail', e.target.value)} placeholder="director@example.com" />
                    </div>
                    <div className="field">
                      <label>Referee Phone</label>
                      <input value={form.refereePhone} onChange={e => set('refereePhone', e.target.value)} placeholder="+91 …" />
                    </div>
                  </div>
                  <div className="t-form-row">
                    <div className="field">
                      <label>Referee Email</label>
                      <input type="email" value={form.refereeEmail} onChange={e => set('refereeEmail', e.target.value)} placeholder="referee@example.com" />
                    </div>
                  </div>

                  {/* Venue */}
                  <div className="field">
                    <label>Venue Address</label>
                    <input value={form.venueAddress} onChange={e => set('venueAddress', e.target.value)} placeholder="Street / landmark" />
                  </div>
                  <div className="t-form-row">
                    <div className="field">
                      <label>Pincode</label>
                      <input value={form.venuePincode} onChange={e => set('venuePincode', e.target.value)} placeholder="500001" />
                    </div>
                    <div className="field">
                      <label>Venue Phone</label>
                      <input value={form.venuePhone} onChange={e => set('venuePhone', e.target.value)} placeholder="+91 …" />
                    </div>
                  </div>
                  <div className="t-form-row">
                    <div className="field">
                      <label>Ball Brand</label>
                      <input value={form.ballBrand} onChange={e => set('ballBrand', e.target.value)} placeholder="e.g. Wilson US Open" />
                    </div>
                    <div className="field" style={{ justifyContent: 'flex-end', paddingTop: 20 }}>
                      <label className="t-checkbox-label">
                        <input type="checkbox" checked={form.hasFloodlights} onChange={e => set('hasFloodlights', e.target.checked)} />
                        Floodlights available
                      </label>
                    </div>
                  </div>

                  {/* Fees */}
                  <div className="t-form-row">
                    <div className="field">
                      <label>Entry Fee – Singles (₹)</label>
                      <input type="number" min="0" value={form.entryFeeSingles} onChange={e => set('entryFeeSingles', e.target.value)} placeholder="0" />
                    </div>
                    <div className="field">
                      <label>Entry Fee – Doubles (₹)</label>
                      <input type="number" min="0" value={form.entryFeeDoubles} onChange={e => set('entryFeeDoubles', e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="t-form-row">
                    <div className="field">
                      <label>Daily Allowance (₹)</label>
                      <input type="number" min="0" value={form.dailyAllowance} onChange={e => set('dailyAllowance', e.target.value)} placeholder="0" />
                    </div>
                    <div className="field">
                      <label>Stringing Charges</label>
                      <input value={form.stringingCharges} onChange={e => set('stringingCharges', e.target.value)} placeholder="e.g. ₹150/set" />
                    </div>
                  </div>

                  {/* AITA registration card */}
                  <div className="field">
                    <label className="t-checkbox-label">
                      <input type="checkbox" checked={form.aitaCardRequired} onChange={e => set('aitaCardRequired', e.target.checked)} />
                      AITA registration card required at sign-in
                    </label>
                  </div>

                  {/* Hotel / accommodation (informational reference only) */}
                  <div className="field">
                    <label>Hotel / Accommodation</label>
                    {form.hotelOptions.map((hotel, idx) => (
                      <div key={idx} className="t-form-row" style={{ marginBottom: 6, alignItems: 'flex-end' }}>
                        <div className="field">
                          <input value={hotel.name} onChange={e => updateHotelRow(idx, 'name', e.target.value)} placeholder="Hotel name" />
                        </div>
                        <div className="field">
                          <input value={hotel.address} onChange={e => updateHotelRow(idx, 'address', e.target.value)} placeholder="Address" />
                        </div>
                        <div className="field">
                          <input value={hotel.phone} onChange={e => updateHotelRow(idx, 'phone', e.target.value)} placeholder="Phone" />
                        </div>
                        <div className="field">
                          <input type="number" min="0" value={hotel.roomRate} onChange={e => updateHotelRow(idx, 'roomRate', e.target.value)} placeholder="Room rate (₹)" />
                        </div>
                        <div className="field">
                          <input value={hotel.distanceToVenue} onChange={e => updateHotelRow(idx, 'distanceToVenue', e.target.value)} placeholder="Distance to venue" />
                        </div>
                        <label className="t-checkbox-label" style={{ paddingBottom: 8 }}>
                          <input type="checkbox" checked={hotel.breakfastIncluded} onChange={e => updateHotelRow(idx, 'breakfastIncluded', e.target.checked)} />
                          Breakfast
                        </label>
                        <button type="button" className="t-icon-btn t-icon-btn-del" onClick={() => removeHotelRow(idx)} title="Remove">✕</button>
                      </div>
                    ))}
                    <button type="button" className="action-btn" onClick={addHotelRow}>+ Add Hotel</button>
                  </div>

                  {/* Sign-in instructions */}
                  <div className="field">
                    <label>Sign-in Instructions</label>
                    <textarea
                      rows={3}
                      className="t-bulk-textarea"
                      value={form.signinInstructions}
                      onChange={e => set('signinInstructions', e.target.value)}
                      placeholder="e.g. Qualifying sign-in: Fri 18 Jul, 12–2pm at venue reception"
                    />
                  </div>
                </>
              )}

              {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action-btn primary">
                  Next: Add Events →
                </button>
                <button type="button" className="action-btn" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>}

            {/* Step 2: Add Events */}
            {step === 2 && (
              <div className="t-events-step">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--text2,#888)' }}>
                    {form.grade && <strong>{form.grade}</strong>} · Draw sizes auto-filled from AITA rules
                  </span>
                  <button type="button" className="action-btn" onClick={addEventRow}>+ Add Event</button>
                </div>

                {eventRows.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text2,#888)', fontSize: 14 }}>
                    No events yet — click "+ Add Event" to add events, or skip to create the tournament without events.
                  </div>
                )}

                {eventRows.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border,#333)' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px' }}>Category</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px' }}>Age</th>
                          <th style={{ textAlign: 'center', padding: '4px 6px' }}>Draw</th>
                          <th style={{ textAlign: 'center', padding: '4px 6px' }}>Seeds</th>
                          <th style={{ textAlign: 'center', padding: '4px 6px' }}>Qual?</th>
                          <th style={{ textAlign: 'center', padding: '4px 6px' }}>Qual Size</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventRows.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border,#222)' }}>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={row.category} onChange={e => updateEventRow(idx, 'category', e.target.value)} style={{ fontSize: 13 }}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={row.ageGroup} onChange={e => updateEventRow(idx, 'ageGroup', e.target.value)} style={{ fontSize: 13 }}>
                                {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <select value={row.drawSize} onChange={e => updateEventRow(idx, 'drawSize', Number(e.target.value))} style={{ fontSize: 13, width: 60 }}>
                                {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <select value={row.numSeeds} onChange={e => updateEventRow(idx, 'numSeeds', Number(e.target.value))} style={{ fontSize: 13, width: 55 }}>
                                {[2,4,8,16,32].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <input type="checkbox" checked={!!row.hasQualifying} onChange={e => updateEventRow(idx, 'hasQualifying', e.target.checked)} />
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              {row.hasQualifying ? (
                                <>
                                  <select value={row.qualifyingSize} onChange={e => updateEventRow(idx, 'qualifyingSize', Number(e.target.value))} style={{ fontSize: 13, width: 60 }}>
                                    {[16,32,48,64].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {row.qualifyingOpen && (
                                    <div style={{ fontSize: 11, color: 'var(--text2,#888)', marginTop: 2 }} title="AITA rules: qualifying for this grade is open (no cap) — this is just a starting size, set the real count once qualifying sign-in closes.">
                                      Open draw — adjust after sign-in
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <button type="button" onClick={() => removeEventRow(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2,#888)', fontSize: 16 }} title="Remove">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button type="button" className="action-btn" onClick={() => { setStep(1); setSaveError(''); }}>
                    ← Back
                  </button>
                  <button type="button" className="action-btn primary" disabled={saving} onClick={handleSubmitAll}>
                    {saving ? 'Creating…' : `Create Tournament${eventRows.length > 0 ? ` + ${eventRows.length} Event${eventRows.length !== 1 ? 's' : ''}` : ''}`}
                  </button>
                  <button type="button" className="action-btn" onClick={closeModal}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="page-scroll">
        {missingPlayerFields.length > 0 && (
          <div style={{
            background: '#7c3a00', color: '#ffd9b0',
            borderRadius: 8, padding: '10px 14px',
            margin: '0 16px 12px', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span>
              Complete your profile to enter tournaments — missing: <strong>{missingPlayerFields.join(', ')}</strong>.{' '}
              <Link to="/profile" style={{ color: '#ffd9b0', textDecoration: 'underline' }}>Update Profile →</Link>
            </span>
          </div>
        )}
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
