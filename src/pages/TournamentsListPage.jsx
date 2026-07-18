import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import { parseFactsheetPdf } from '../utils/parseFactsheet';

const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet', 'Artificial Grass'];
const STATES = ['AP','TS','MH','KA','TN','KL','DL','UP','WB','GJ','RJ','MP','PB','HR','UK','HP','JK','OD','AS','MN','NL','SK','TR','MZ','AR','GA','JH','CG','BR','BH'];
const GRADES = ['National Series', 'State', 'ITF Grade 1', 'ITF Grade 2', 'ITF Grade 3', 'ITF Grade 4', 'ITF Grade 5', 'Satellite'];

const EMPTY_FORM = {
  name: '', subtitle: '', tournamentCode: '',
  location: '', city: '', stateAbbr: '', surface: 'Hard',
  startDate: '', endDate: '', referee: '',
  numCourts: 2, dayStartTime: '09:00',
  // Phase 12 — optional factsheet fields
  grade: '',
  entryDeadline: '', withdrawalDeadline: '',
  qualifyingStartDate: '', qualifyingEndDate: '',
  directorName: '', directorPhone: '', directorEmail: '',
  refereePhone: '', refereeEmail: '',
  venueAddress: '', venuePincode: '', venuePhone: '',
  ballBrand: '', hasFloodlights: false,
  entryFeeSingles: '', entryFeeDoubles: '', dailyAllowance: '',
  signinInstructions: '',
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
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [parsedFromPdf, setParsedFromPdf] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const pdfInputRef = useRef(null);

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
      setParsedFromPdf(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to create tournament');
    } finally {
      setSaving(false);
    }
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
        <div className="t-modal-overlay" onClick={() => { setShowCreate(false); setParsedFromPdf(false); }}>
          <div className="t-modal" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">
                {parsedFromPdf ? 'Review Tournament Details' : 'New Tournament Week'}
              </span>
              <button className="drawer-close" onClick={() => { setShowCreate(false); setParsedFromPdf(false); }}>✕</button>
            </div>

            {parsedFromPdf && (
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
                <button type="submit" className="action-btn primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Tournament Week'}
                </button>
                <button type="button" className="action-btn" onClick={() => { setShowCreate(false); setParsedFromPdf(false); }}>
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
