import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { parseFactsheetPdf } from '../utils/parseFactsheet';
import { getAitaDrawDefaults, mainDrawComposition, qualifyingDrawComposition, seedCountForDraw, DOUBLES_NUM_SEEDS } from '../utils/aitaGradeRules';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';
import { cn } from '../lib/utils';

const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet', 'Artificial Grass'];
const STATES = ['AP','TS','MH','KA','TN','KL','DL','UP','WB','GJ','RJ','MP','PB','HR','UK','HP','JK','OD','AS','MN','NL','SK','TR','MZ','AR','GA','JH','CG','BR','BH'];
const GRADES = ['National Series', 'Super Series', 'Championship Series (7-Day)', 'Championship Series (3-Day)', 'Talent Series', 'Nationals', 'State', 'ITF Grade 1', 'ITF Grade 2', 'ITF Grade 3', 'ITF Grade 4', 'ITF Grade 5', 'Satellite'];
const CATEGORIES = ['Boys Singles', 'Girls Singles', 'Boys Doubles', 'Girls Doubles', 'Mixed Doubles', 'Men Singles', 'Women Singles', 'Men Doubles', 'Women Doubles'];
const AGE_GROUPS = ['U10', 'U12', 'U14', 'U16', 'U18', 'Open'];
const DRAW_SIZES = [4, 8, 16, 32, 48, 64, 128];

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9 w-full';

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

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
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Live Events &amp; Draw Tracker</div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Tournaments</h1>
          {parseError && <div className="text-sm text-destructive mt-1">{parseError}</div>}
        </div>
        {isOrganizer && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { pdfInputRef.current?.click(); setParseError(''); }} disabled={parsing} title="Upload AITA Factsheet PDF to auto-fill the form">
              {parsing ? 'Reading PDF…' : '⬆ Upload Factsheet PDF'}
            </Button>
            <Button variant="outline" onClick={openCreateManual}>+ Create Manually</Button>
            <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handlePdfUpload} />
          </div>
        )}
      </div>

      {/* Create Week Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-card border border-border rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <span className="text-lg font-display font-extrabold tracking-tight">
                {step === 2 ? `Add Events — ${form.name}` : parsedFromPdf ? 'Review Tournament Details' : 'New Tournament Week'}
              </span>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
            </div>

            <div className="flex gap-1.5 mb-4">
              <span className={cn('rounded-sm px-2.5 py-0.5 text-xs font-semibold', step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>1 · Tournament Details</span>
              <span className={cn('rounded-sm px-2.5 py-0.5 text-xs font-semibold', step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>2 · Add Events</span>
            </div>

            {parsedFromPdf && step === 1 && (
              <div className="rounded-sm bg-primary/10 border border-primary/30 text-accent-ink text-sm px-3 py-2 mb-4 flex items-center gap-2">
                <span>✓ Auto-filled from Factsheet PDF — review and edit before submitting</span>
                <button type="button" className="ml-auto bg-transparent text-accent-ink" onClick={() => setParsedFromPdf(false)} title="Dismiss">✕</button>
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleStep1} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tournament Name *">
                    <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. SMTA AITA Circuit" autoFocus />
                  </Field>
                  <Field label="Subtitle / Series">
                    <Input value={form.subtitle} onChange={e => set('subtitle', e.target.value)} placeholder="e.g. AITA Circuit" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tournament Code">
                    <Input value={form.tournamentCode} onChange={e => set('tournamentCode', e.target.value)} placeholder="e.g. HYD-2026-07" />
                  </Field>
                  <Field label="Surface">
                    <select className={selectCls} value={form.surface} onChange={e => set('surface', e.target.value)}>
                      {SURFACES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="City">
                    <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Hyderabad" />
                  </Field>
                  <Field label="State">
                    <select className={selectCls} value={form.stateAbbr} onChange={e => set('stateAbbr', e.target.value)}>
                      <option value="">— State —</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Venue / Facility">
                    <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Club / sports complex" />
                  </Field>
                  <Field label="Referee">
                    <Input value={form.referee} onChange={e => set('referee', e.target.value)} placeholder="Referee name" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Start Date"><Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
                  <Field label="End Date"><Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Number of Courts">
                    <Input type="number" min="1" max="20" value={form.numCourts} onChange={e => set('numCourts', e.target.value)} />
                  </Field>
                  <Field label="Day Start Time">
                    <Input type="time" value={form.dayStartTime} onChange={e => set('dayStartTime', e.target.value)} />
                  </Field>
                </div>

                {/* ── More Details (optional / Phase 12) ───────────────────── */}
                <div className="pt-2 border-t border-border">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowMore(v => !v)}>
                    {showMore ? '▲ Hide Details' : '▼ More Details (optional)'}
                  </Button>
                </div>

                {showMore && (
                  <div className="space-y-3">
                    <Field label="Grade / Series">
                      <select className={selectCls} value={form.grade} onChange={e => set('grade', e.target.value)}>
                        <option value="">— select —</option>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Entry Deadline"><Input type="date" value={form.entryDeadline} onChange={e => set('entryDeadline', e.target.value)} /></Field>
                      <Field label="Withdrawal Deadline"><Input type="date" value={form.withdrawalDeadline} onChange={e => set('withdrawalDeadline', e.target.value)} /></Field>
                      <Field label="Freeze Deadline"><Input type="datetime-local" value={form.freezeDeadline} onChange={e => set('freezeDeadline', e.target.value)} /></Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Qualifying Start Date"><Input type="date" value={form.qualifyingStartDate} onChange={e => set('qualifyingStartDate', e.target.value)} /></Field>
                      <Field label="Qualifying End Date"><Input type="date" value={form.qualifyingEndDate} onChange={e => set('qualifyingEndDate', e.target.value)} /></Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Tournament Director"><Input value={form.directorName} onChange={e => set('directorName', e.target.value)} placeholder="Director name" /></Field>
                      <Field label="Director Phone"><Input value={form.directorPhone} onChange={e => set('directorPhone', e.target.value)} placeholder="+91 …" /></Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Director Email"><Input type="email" value={form.directorEmail} onChange={e => set('directorEmail', e.target.value)} placeholder="director@example.com" /></Field>
                      <Field label="Referee Phone"><Input value={form.refereePhone} onChange={e => set('refereePhone', e.target.value)} placeholder="+91 …" /></Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Referee Email"><Input type="email" value={form.refereeEmail} onChange={e => set('refereeEmail', e.target.value)} placeholder="referee@example.com" /></Field>
                    </div>

                    <Field label="Venue Address">
                      <Input value={form.venueAddress} onChange={e => set('venueAddress', e.target.value)} placeholder="Street / landmark" />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Pincode"><Input value={form.venuePincode} onChange={e => set('venuePincode', e.target.value)} placeholder="500001" /></Field>
                      <Field label="Venue Phone"><Input value={form.venuePhone} onChange={e => set('venuePhone', e.target.value)} placeholder="+91 …" /></Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <Field label="Ball Brand"><Input value={form.ballBrand} onChange={e => set('ballBrand', e.target.value)} placeholder="e.g. Wilson US Open" /></Field>
                      <label className="flex items-center gap-2 text-sm pb-1.5">
                        <input type="checkbox" className="accent-primary" checked={form.hasFloodlights} onChange={e => set('hasFloodlights', e.target.checked)} />
                        Floodlights available
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Entry Fee – Singles (₹)"><Input type="number" min="0" value={form.entryFeeSingles} onChange={e => set('entryFeeSingles', e.target.value)} placeholder="0" /></Field>
                      <Field label="Entry Fee – Doubles (₹)"><Input type="number" min="0" value={form.entryFeeDoubles} onChange={e => set('entryFeeDoubles', e.target.value)} placeholder="0" /></Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Daily Allowance (₹)"><Input type="number" min="0" value={form.dailyAllowance} onChange={e => set('dailyAllowance', e.target.value)} placeholder="0" /></Field>
                      <Field label="Stringing Charges"><Input value={form.stringingCharges} onChange={e => set('stringingCharges', e.target.value)} placeholder="e.g. ₹150/set" /></Field>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-primary" checked={form.aitaCardRequired} onChange={e => set('aitaCardRequired', e.target.checked)} />
                      AITA registration card required at sign-in
                    </label>

                    {/* Hotel / accommodation (informational reference only) */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1.5">Hotel / Accommodation</div>
                      <div className="space-y-2">
                        {form.hotelOptions.map((hotel, idx) => (
                          <div key={idx} className="border border-border rounded-sm p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <Input value={hotel.name} onChange={e => updateHotelRow(idx, 'name', e.target.value)} placeholder="Hotel name" />
                            <Input value={hotel.address} onChange={e => updateHotelRow(idx, 'address', e.target.value)} placeholder="Address" />
                            <Input value={hotel.phone} onChange={e => updateHotelRow(idx, 'phone', e.target.value)} placeholder="Phone" />
                            <Input type="number" min="0" value={hotel.roomRate} onChange={e => updateHotelRow(idx, 'roomRate', e.target.value)} placeholder="Room rate (₹)" />
                            <Input value={hotel.distanceToVenue} onChange={e => updateHotelRow(idx, 'distanceToVenue', e.target.value)} placeholder="Distance to venue" />
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" className="accent-primary" checked={hotel.breakfastIncluded} onChange={e => updateHotelRow(idx, 'breakfastIncluded', e.target.checked)} />
                                Breakfast
                              </label>
                              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeHotelRow(idx)} title="Remove">✕</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addHotelRow}>+ Add Hotel</Button>
                    </div>

                    <Field label="Sign-in Instructions">
                      <Textarea rows={3} value={form.signinInstructions} onChange={e => set('signinInstructions', e.target.value)} placeholder="e.g. Qualifying sign-in: Fri 18 Jul, 12–2pm at venue reception" />
                    </Field>
                  </div>
                )}

                {saveError && <div className="text-sm text-destructive">{saveError}</div>}

                <div className="flex gap-2 pt-2">
                  <Button type="submit">Next: Add Events →</Button>
                  <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                </div>
              </form>
            )}

            {/* Step 2: Add Events */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    {form.grade && <strong className="text-foreground">{form.grade}</strong>} · Draw sizes auto-filled from AITA rules
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={addEventRow}>+ Add Event</Button>
                </div>

                {eventRows.length === 0 && (
                  <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
                    No events yet — click "+ Add Event" to add events, or skip to create the tournament without events.
                  </div>
                )}

                {eventRows.length > 0 && (
                  <div className="rounded-sm border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead className="text-center">Draw</TableHead>
                          <TableHead className="text-center">Seeds</TableHead>
                          <TableHead className="text-center">Qual?</TableHead>
                          <TableHead className="text-center">Qual Size</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventRows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <select className={selectCls} value={row.category} onChange={e => updateEventRow(idx, 'category', e.target.value)}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </TableCell>
                            <TableCell>
                              <select className={selectCls} value={row.ageGroup} onChange={e => updateEventRow(idx, 'ageGroup', e.target.value)}>
                                {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </TableCell>
                            <TableCell className="text-center">
                              <select className={selectCls} value={row.drawSize} onChange={e => updateEventRow(idx, 'drawSize', Number(e.target.value))}>
                                {DRAW_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </TableCell>
                            <TableCell className="text-center">
                              <select className={selectCls} value={row.numSeeds} onChange={e => updateEventRow(idx, 'numSeeds', Number(e.target.value))}>
                                {[2,4,8,16,32].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </TableCell>
                            <TableCell className="text-center">
                              <input type="checkbox" className="accent-primary" checked={!!row.hasQualifying} onChange={e => updateEventRow(idx, 'hasQualifying', e.target.checked)} />
                            </TableCell>
                            <TableCell className="text-center">
                              {row.hasQualifying ? (
                                <>
                                  <select className={selectCls} value={row.qualifyingSize} onChange={e => updateEventRow(idx, 'qualifyingSize', Number(e.target.value))}>
                                    {[16,32,48,64].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {row.qualifyingOpen && (
                                    <div className="text-[11px] text-muted-foreground mt-0.5" title="AITA rules: qualifying for this grade is open (no cap) — this is just a starting size, set the real count once qualifying sign-in closes.">
                                      Open draw — adjust after sign-in
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              <button type="button" onClick={() => removeEventRow(idx)} className="bg-transparent text-muted-foreground hover:text-destructive" title="Remove">✕</button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {saveError && <div className="text-sm text-destructive">{saveError}</div>}

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setStep(1); setSaveError(''); }}>← Back</Button>
                  <Button type="button" disabled={saving} onClick={handleSubmitAll}>
                    {saving ? 'Creating…' : `Create Tournament${eventRows.length > 0 ? ` + ${eventRows.length} Event${eventRows.length !== 1 ? 's' : ''}` : ''}`}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {missingPlayerFields.length > 0 && (
        <div className="rounded-sm border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2.5 flex items-center gap-2.5">
          <span className="text-lg">⚠</span>
          <span>
            Complete your profile to enter tournaments — missing: <strong>{missingPlayerFields.join(', ')}</strong>.{' '}
            <Link to="/profile" className="underline">Update Profile →</Link>
          </span>
        </div>
      )}
      {error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      )}

      {weeks === null && !error && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading tournaments…</div>
      )}

      {weeks && weeks.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          {isOrganizer
            ? 'No tournament weeks yet. Click + New Tournament Week to create one.'
            : 'No tournaments are currently scheduled.'}
        </div>
      )}

      {weeks && weeks.length > 0 && (
        <div className="space-y-2.5">
          {weeks.map(w => (
            <div key={w.id} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all">
              <Link to={`/tournaments/${w.id}`} className="flex-1 min-w-0">
                <div className="text-sm sm:text-base font-bold truncate">{w.name}</div>
                {w.subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{w.subtitle}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {w.surface && <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2.5 py-0.5 text-[0.7rem] font-semibold">{w.surface}</span>}
                  {w.tournamentCode && <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[0.7rem] font-semibold">{w.tournamentCode}</span>}
                  {w.eventCount !== undefined && <span className="inline-flex items-center rounded-full bg-primary/10 text-accent-ink px-2.5 py-0.5 text-[0.7rem] font-semibold">{w.eventCount} event{w.eventCount !== 1 ? 's' : ''}</span>}
                  {w.source && w.source !== 'organiser' && (
                    <span className="inline-flex items-center rounded-full bg-chart-2/15 text-chart-2 px-2.5 py-0.5 text-[0.7rem] font-semibold">
                      {w.source === 'aita_claimed' ? 'Claimed from AITA Calendar' : 'From AITA Calendar'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 flex-wrap">
                  {(w.city || w.stateAbbr) && (
                    <span className="inline-flex items-center gap-1">
                      📍 {[w.city, w.stateAbbr].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {w.location && <span>· {w.location}</span>}
                </div>
                {(w.startDate || w.endDate) && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    📅 {formatDateRange(w.startDate, w.endDate)}
                  </div>
                )}
                {w.numCourts && (
                  <div className="text-xs text-muted-foreground mt-1">🎾 {w.numCourts} court{w.numCourts !== 1 ? 's' : ''}</div>
                )}
              </Link>
              {w.createdBy === user?.id && (
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0" onClick={() => handleDelete(w.id)} title="Delete tournament week">
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
