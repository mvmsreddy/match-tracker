import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import { applySeeding, buildByeEntries, buildR1Matches, swapPositions } from '../utils/drawEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_CODES = ['', 'WC', 'LL', 'Q', 'PR', 'ITF'];
const STATES = ['AP','TS','MH','KA','TN','KL','DL','UP','WB','GJ','RJ','MP','PB','HR',
                 'UK','HP','JK','OD','AS','MN','NL','SK','TR','MZ','AR','GA','JH','CG','BR','BH'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nextEmptyPos(entries, maxPos) {
  const taken = new Set(entries.map(e => e.position));
  for (let i = 1; i <= maxPos; i++) if (!taken.has(i)) return i;
  return maxPos + 1;
}

function parseBulk(text, existingPositions, maxPos) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const entries = [];
  const errors = [];
  let pos = 1;
  while (existingPositions.has(pos) && pos <= maxPos) pos++;

  lines.forEach((line, idx) => {
    const p = line.split(',').map(x => x.trim());
    if (!p[0]) { errors.push(`Line ${idx + 1}: family name is required`); return; }
    entries.push({
      position: pos,
      familyName: p[0],
      firstName: p[1] || '',
      aitaReg: p[2] || '',
      playerState: p[3] || '',
      ranking: p[4] ? Number(p[4]) : null,
      seed: p[5] ? Number(p[5]) : null,
      statusCode: p[6] || '',
    });
    pos++;
    while (existingPositions.has(pos) && pos <= maxPos) pos++;
  });
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// BulkImportModal
// ---------------------------------------------------------------------------
function BulkImportModal({ event, drawType, existingEntries, onImport, onClose }) {
  const maxPos = drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32);
  const existingPositions = new Set(existingEntries.map(e => e.position));
  const remaining = maxPos - existingEntries.length;

  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function handlePreview() {
    const { entries, errors } = parseBulk(text, existingPositions, maxPos);
    setPreview(entries);
    setParseErrors(errors);
    setSaveError('');
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      await onImport(preview);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal t-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">Bulk Import Players</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="t-bulk-help">
          Format per line: <code>FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode</code>
          <br />
          Lines starting with <code>#</code> are skipped. {remaining} slot{remaining !== 1 ? 's' : ''} available in this draw.
        </div>

        {!preview && (
          <>
            <textarea
              className="t-bulk-textarea"
              rows={10}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'# Example:\nBhosale, Priya, AITA12345, TS, 45, 1,\nSharma, Ananya, AITA67890, MH, 78, 2,\nReddy, Kavya, , AP, 112, ,'}
              autoFocus
            />
            {parseErrors.length > 0 && (
              <div className="login-error" style={{ marginTop: 8 }}>
                {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </>
        )}

        {preview && (
          <div className="t-bulk-preview">
            <div className="t-section-label">{preview.length} player{preview.length !== 1 ? 's' : ''} to import</div>
            <div className="t-entry-table-wrap">
              <table className="t-entry-table">
                <thead>
                  <tr><th>Pos</th><th>Seed</th><th>Name</th><th>AITA Reg</th><th>State</th><th>Rank</th></tr>
                </thead>
                <tbody>
                  {preview.map((e, i) => (
                    <tr key={i}>
                      <td>{e.position}</td>
                      <td>{e.seed || '—'}</td>
                      <td>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</td>
                      <td>{e.aitaReg || '—'}</td>
                      <td>{e.playerState || '—'}</td>
                      <td>{e.ranking || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {!preview && (
            <button className="action-btn primary" onClick={handlePreview} disabled={!text.trim()}>
              Preview
            </button>
          )}
          {preview && (
            <>
              <button
                className="action-btn primary"
                disabled={saving || preview.length === 0}
                onClick={handleImport}
              >
                {saving ? 'Importing…' : `Import ${preview.length} Player${preview.length !== 1 ? 's' : ''}`}
              </button>
              <button className="action-btn" onClick={() => { setPreview(null); setSaveError(''); }}>
                Back
              </button>
            </>
          )}
          <button className="action-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddEntryModal
// ---------------------------------------------------------------------------
function AddEntryModal({ event, week, drawType, editingEntry, existingEntries, onSave, onClose }) {
  const maxPos = drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32);

  const [form, setForm] = useState(() => {
    if (editingEntry) {
      return {
        position: editingEntry.position,
        seed: editingEntry.seed || '',
        statusCode: editingEntry.statusCode || '',
        familyName: editingEntry.familyName || '',
        firstName: editingEntry.firstName || '',
        aitaReg: editingEntry.aitaReg || '',
        playerState: editingEntry.playerState || '',
        ranking: editingEntry.ranking || '',
        dateOfBirth: editingEntry.dateOfBirth || '',
        isAlternate: editingEntry.isAlternate || false,
        replacingName: editingEntry.replacingName || '',
        partnerFamilyName: editingEntry.partnerFamilyName || '',
        partnerFirstName: editingEntry.partnerFirstName || '',
        partnerAitaReg: editingEntry.partnerAitaReg || '',
        partnerState: editingEntry.partnerState || '',
        partnerRanking: editingEntry.partnerRanking || '',
        playerId: editingEntry.playerId || null,
      };
    }
    return {
      position: nextEmptyPos(existingEntries, maxPos),
      seed: '', statusCode: '',
      familyName: '', firstName: '', aitaReg: '', playerState: '',
      ranking: '', dateOfBirth: '',
      isAlternate: false, replacingName: '',
      partnerFamilyName: '', partnerFirstName: '', partnerAitaReg: '', partnerState: '', partnerRanking: '',
      playerId: null,
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Debounced platform search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await api.searchPlayers(searchQuery)); }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  function fillFromPlayer(player) {
    const parts = (player.displayName || '').trim().split(' ');
    const familyName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    setForm(prev => ({
      ...prev,
      playerId: player.id,
      familyName,
      firstName,
      aitaReg: player.aitaReg || '',
      playerState: player.stateAbbr || '',
      ranking: player.ranking || '',
    }));
    setSearchQuery('');
    setSearchResults([]);
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');

    if (!form.familyName.trim()) { setError('Family name is required.'); return; }
    if (event.isDoubles && !form.partnerFamilyName.trim()) {
      setError('Partner family name is required for doubles.'); return;
    }

    const posNum = Number(form.position);
    if (!posNum || posNum < 1 || posNum > maxPos) {
      setError(`Position must be 1 – ${maxPos}.`); return;
    }
    const conflict = existingEntries.find(
      en => en.position === posNum && (!editingEntry || en.id !== editingEntry.id)
    );
    if (conflict) {
      setError(`Position ${posNum} is already taken by ${conflict.familyName}.`); return;
    }

    // Participation limit check
    if (form.aitaReg && week) {
      try {
        const participation = await api.getPlayerWeekParticipation(week.id, form.aitaReg, event.id);
        const singlesCount = participation.filter(p => !p.isDoubles).length;
        const doublesCount = participation.filter(p => p.isDoubles).length;
        if (!event.isDoubles && singlesCount >= week.maxSinglesPerPlayer) {
          setError(`${form.familyName} is already entered in ${singlesCount} singles event(s). Max is ${week.maxSinglesPerPlayer}.`);
          return;
        }
        if (event.isDoubles && doublesCount >= week.maxDoublesPerPlayer) {
          setError(`${form.familyName} is already entered in ${doublesCount} doubles event(s). Max is ${week.maxDoublesPerPlayer}.`);
          return;
        }
      } catch { /* non-blocking */ }
    }

    setSaving(true);
    try {
      await onSave(editingEntry?.id || null, { ...form, position: posNum });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal t-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">{editingEntry ? 'Edit Entry' : 'Add Player'}</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="t-create-form">
          {/* Position / Seed / Status */}
          <div className="t-form-row">
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Draw Position</label>
              <input
                type="number" min="1" max={maxPos}
                value={form.position}
                onChange={e => set('position', e.target.value)}
              />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Seed</label>
              <input
                type="number" min="1" max={event.numSeeds}
                value={form.seed}
                onChange={e => set('seed', e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="field">
              <label>Status Code</label>
              <select value={form.statusCode} onChange={e => set('statusCode', e.target.value)}>
                {STATUS_CODES.map(c => (
                  <option key={c} value={c}>{c || '— None —'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Platform player search */}
          <div className="field">
            <label>Search Platform Player (optional)</label>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Type name or AITA reg to auto-fill…"
            />
            {searching && <div className="t-search-hint">Searching…</div>}
            {searchResults.length > 0 && (
              <div className="t-search-results">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="t-search-result-item"
                    onClick={() => fillFromPlayer(p)}
                  >
                    <span className="t-sr-name">{p.displayName}</span>
                    <span className="t-sr-meta">
                      {[p.aitaReg, p.stateAbbr, p.ranking && `Rank ${p.ranking}`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Player details */}
          <div className="t-section-label">Player Details</div>
          <div className="t-form-row">
            <div className="field">
              <label>Family Name *</label>
              <input
                value={form.familyName}
                onChange={e => set('familyName', e.target.value)}
                placeholder="Last name"
                autoFocus={!editingEntry}
              />
            </div>
            <div className="field">
              <label>First Name</label>
              <input
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="First name"
              />
            </div>
          </div>
          <div className="t-form-row">
            <div className="field">
              <label>AITA Reg #</label>
              <input
                value={form.aitaReg}
                onChange={e => set('aitaReg', e.target.value)}
                placeholder="e.g. MHAP12345"
              />
            </div>
            <div className="field">
              <label>State</label>
              <select value={form.playerState} onChange={e => set('playerState', e.target.value)}>
                <option value="">— State —</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="t-form-row">
            <div className="field">
              <label>Ranking</label>
              <input
                type="number" min="1"
                value={form.ranking}
                onChange={e => set('ranking', e.target.value)}
                placeholder="AITA rank"
              />
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={e => set('dateOfBirth', e.target.value)}
              />
            </div>
          </div>

          {/* Doubles partner */}
          {event.isDoubles && (
            <>
              <div className="t-section-label" style={{ marginTop: 12 }}>Partner Details</div>
              <div className="t-form-row">
                <div className="field">
                  <label>Partner Family Name *</label>
                  <input
                    value={form.partnerFamilyName}
                    onChange={e => set('partnerFamilyName', e.target.value)}
                    placeholder="Partner last name"
                  />
                </div>
                <div className="field">
                  <label>Partner First Name</label>
                  <input
                    value={form.partnerFirstName}
                    onChange={e => set('partnerFirstName', e.target.value)}
                    placeholder="Partner first name"
                  />
                </div>
              </div>
              <div className="t-form-row">
                <div className="field">
                  <label>Partner AITA Reg #</label>
                  <input
                    value={form.partnerAitaReg}
                    onChange={e => set('partnerAitaReg', e.target.value)}
                    placeholder="e.g. MHAP67890"
                  />
                </div>
                <div className="field">
                  <label>Partner State</label>
                  <select value={form.partnerState} onChange={e => set('partnerState', e.target.value)}>
                    <option value="">— State —</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="t-form-row">
                <div className="field" style={{ maxWidth: 160 }}>
                  <label>Partner Ranking</label>
                  <input
                    type="number" min="1"
                    value={form.partnerRanking}
                    onChange={e => set('partnerRanking', e.target.value)}
                    placeholder="Rank"
                  />
                </div>
              </div>
            </>
          )}

          {/* Alternate */}
          <div className="field" style={{ marginTop: 4 }}>
            <label className="t-checkbox-label">
              <input
                type="checkbox"
                checked={form.isAlternate}
                onChange={e => set('isAlternate', e.target.checked)}
              />
              Alternate / replacement entry
            </label>
            {form.isAlternate && (
              <input
                style={{ marginTop: 6 }}
                value={form.replacingName}
                onChange={e => set('replacingName', e.target.value)}
                placeholder="Replacing (player name)"
              />
            )}
          </div>

          {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="action-btn primary" disabled={saving}>
              {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Add Player'}
            </button>
            <button type="button" className="action-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntryRow  (players list view)
// ---------------------------------------------------------------------------
function EntryRow({ entry, isDoubles, isOwner, swapMode, selected, onSelect, onEdit, onDelete }) {
  const isBye = entry.isBye;
  return (
    <tr
      className={
        't-entry-row' +
        (isBye ? ' t-entry-bye' : '') +
        (selected ? ' t-entry-selected' : '') +
        (swapMode && !isBye ? ' t-entry-swappable' : '')
      }
      onClick={swapMode && !isBye ? () => onSelect(entry) : undefined}
    >
      <td className="t-entry-pos">{entry.position}</td>
      <td className="t-entry-seed">
        {entry.seed ? <span className="t-seed-badge">[{entry.seed}]</span> : <span className="t-entry-dash">—</span>}
      </td>
      <td className="t-entry-name">
        {isBye ? (
          <span className="t-bye-label">BYE</span>
        ) : (
          <>
            <div className="t-entry-name-main">
              {entry.familyName}
              {entry.firstName ? <span className="t-entry-first">, {entry.firstName}</span> : null}
            </div>
            {isDoubles && entry.partnerFamilyName && (
              <div className="t-entry-partner">
                + {entry.partnerFamilyName}
                {entry.partnerFirstName ? `, ${entry.partnerFirstName}` : ''}
              </div>
            )}
            {entry.isAlternate && (
              <span className="t-alt-badge">ALT{entry.replacingName ? ` → ${entry.replacingName}` : ''}</span>
            )}
          </>
        )}
      </td>
      <td className="t-entry-aita">{entry.aitaReg || <span className="t-entry-dash">—</span>}</td>
      <td className="t-entry-state">{entry.playerState || <span className="t-entry-dash">—</span>}</td>
      <td className="t-entry-rank">{entry.ranking || <span className="t-entry-dash">—</span>}</td>
      <td className="t-entry-sc">
        {entry.statusCode ? <span className="t-sc-badge">{entry.statusCode}</span> : <span className="t-entry-dash">—</span>}
      </td>
      {isOwner && !swapMode && (
        <td className="t-entry-actions">
          {!isBye && <button className="t-icon-btn" onClick={() => onEdit(entry)} title="Edit">✎</button>}
          <button className="t-icon-btn t-icon-btn-del" onClick={() => onDelete(entry.id)} title="Remove">✕</button>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// DrawLinePlayer  (one player line inside a draw-sheet match box)
// ---------------------------------------------------------------------------
function DrawLinePlayer({ entry, pos, selected, swapMode, onClick }) {
  const isBye   = !entry || entry.isBye;
  const isEmpty = !entry;
  return (
    <div
      className={
        't-ds-player' +
        (isBye   ? ' t-ds-bye'      : '') +
        (isEmpty  ? ' t-ds-empty'    : '') +
        (selected ? ' t-ds-selected' : '') +
        (swapMode && !isBye && !isEmpty ? ' t-ds-swappable' : '')
      }
      onClick={swapMode && !isBye && !isEmpty ? onClick : undefined}
    >
      <span className="t-ds-pos">{pos}</span>
      {entry?.seed && <span className="t-ds-seed">[{entry.seed}]</span>}
      <span className="t-ds-name">
        {isEmpty  ? <span className="t-entry-dash">—</span>  :
         isBye    ? 'BYE'                                      :
         `${entry.familyName}${entry.firstName ? ', ' + entry.firstName : ''}`}
      </span>
      {!isBye && !isEmpty && entry.playerState && (
        <span className="t-ds-state">{entry.playerState}</span>
      )}
      {!isBye && !isEmpty && entry.statusCode && (
        <span className="t-sc-badge" style={{ marginLeft: 6 }}>{entry.statusCode}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrawSheet  (R1 pairings bracket view)
// ---------------------------------------------------------------------------
function DrawSheet({ entries, drawSize, isOwner, swapMode, selectedEntry, onSelectEntry }) {
  const matches = buildR1Matches(entries, drawSize);
  return (
    <div className="t-draw-sheet">
      {matches.map(m => (
        <div key={m.slot} className="t-ds-match">
          <div className="t-ds-slot-num">{m.slot}</div>
          <div className="t-ds-lines">
            <DrawLinePlayer
              entry={m.entry1} pos={m.pos1}
              selected={swapMode && selectedEntry?.position === m.pos1}
              swapMode={swapMode}
              onClick={() => onSelectEntry(m.entry1)}
            />
            <div className="t-ds-divider" />
            <DrawLinePlayer
              entry={m.entry2} pos={m.pos2}
              selected={swapMode && selectedEntry?.position === m.pos2}
              swapMode={swapMode}
              onClick={() => onSelectEntry(m.entry2)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventDetailPage
// ---------------------------------------------------------------------------
export default function EventDetailPage() {
  const { id: weekId, eventId } = useParams();
  const { user } = useAuth();

  const [week,    setWeek]    = useState(null);
  const [event,   setEvent]   = useState(null);
  const [entries, setEntries] = useState([]);
  const [drawType, setDrawType] = useState('main');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // View / interaction state
  const [viewMode,       setViewMode]       = useState('list');   // 'list' | 'drawsheet'
  const [swapMode,       setSwapMode]       = useState(false);
  const [selectedEntry,  setSelectedEntry]  = useState(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [editingEntry,   setEditingEntry]   = useState(null);
  const [showBulk,       setShowBulk]       = useState(false);
  const [seeding,        setSeeding]        = useState(false);
  const [fillingByes,    setFillingByes]    = useState(false);

  // Load week + event once
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getTournamentWeek(weekId), api.getEvent(eventId)])
      .then(([w, ev]) => { if (!cancelled) { setWeek(w); setEvent(ev); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load event'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [weekId, eventId]);

  // Reload entries on drawType switch
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    api.getDrawEntries(eventId, drawType)
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e  => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [eventId, drawType, event]);

  const isOwner     = !!(week && user && week.createdBy === user.id);
  const maxPos      = event ? (drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32)) : 0;
  const numSeeds    = event?.numSeeds || 4;
  const sortedEntries = [...entries].sort((a, b) => a.position - b.position);
  const playerCount = entries.filter(e => !e.isBye).length;
  const byeCount    = entries.filter(e => e.isBye).length;
  const fillPct     = maxPos > 0 ? Math.min(Math.round(entries.length / maxPos * 100), 100) : 0;
  const hasSeededPlayers = entries.some(e => e.seed && !e.isBye);
  const hasGaps     = entries.length < maxPos;

  // ---- CRUD ----------------------------------------------------------------
  async function handleSaveEntry(entryId, formData) {
    if (entryId) {
      const updated = await api.updateDrawEntry(entryId, formData);
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
    } else {
      const created = await api.addDrawEntry(eventId, drawType, formData);
      setEntries(prev => [...prev, created].sort((a, b) => a.position - b.position));
    }
  }

  async function handleDeleteEntry(entryId) {
    if (!window.confirm('Remove this entry from the draw?')) return;
    try {
      await api.deleteDrawEntry(entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
    } catch (err) { setError(err.message); }
  }

  async function handleBulkImport(newEntries) {
    const created = await api.bulkAddDrawEntries(eventId, drawType, newEntries);
    setEntries(prev => [...prev, ...created].sort((a, b) => a.position - b.position));
  }

  // ---- AUTO-SEED -----------------------------------------------------------
  async function handleAutoSeed() {
    if (!window.confirm(
      'Auto-Seed will rearrange ALL player positions to match ITF seeding rules. Continue?'
    )) return;
    setSeeding(true);
    setError('');
    try {
      const reseeded = applySeeding(entries, maxPos, numSeeds);
      const saved    = await api.saveDrawEntries(eventId, drawType, reseeded);
      setEntries(saved);
    } catch (err) { setError(err.message); }
    finally { setSeeding(false); }
  }

  // ---- FILL BYEs -----------------------------------------------------------
  async function handleFillByes() {
    setFillingByes(true);
    setError('');
    try {
      const playerEntries = entries.filter(e => !e.isBye);
      const byes = buildByeEntries(maxPos, playerEntries);
      const created = await api.bulkAddDrawEntries(eventId, drawType, byes);
      setEntries(prev => [...prev.filter(e => !e.isBye), ...created]
        .sort((a, b) => a.position - b.position));
    } catch (err) { setError(err.message); }
    finally { setFillingByes(false); }
  }

  // ---- CLEAR BYEs ----------------------------------------------------------
  async function handleClearByes() {
    const byeIds = entries.filter(e => e.isBye).map(e => e.id);
    if (!byeIds.length) return;
    try {
      await Promise.all(byeIds.map(id => api.deleteDrawEntry(id)));
      setEntries(prev => prev.filter(e => !e.isBye));
    } catch (err) { setError(err.message); }
  }

  // ---- SWAP ----------------------------------------------------------------
  function handleSelectForSwap(entry) {
    if (!selectedEntry) {
      setSelectedEntry(entry);
      return;
    }
    if (selectedEntry.id === entry.id) {
      setSelectedEntry(null);
      return;
    }
    // Perform swap
    const newEntries = swapPositions(entries, selectedEntry.position, entry.position);
    setSelectedEntry(null);

    // Persist both
    const a = newEntries.find(e => e.id === selectedEntry.id);
    const b = newEntries.find(e => e.id === entry.id);
    Promise.all([
      api.updateDrawEntry(a.id, { ...a }),
      api.updateDrawEntry(b.id, { ...b }),
    ])
      .then(() => setEntries(newEntries))
      .catch(err => setError(err.message));
  }

  function toggleSwapMode() {
    setSwapMode(prev => !prev);
    setSelectedEntry(null);
  }

  // ---- RENDER --------------------------------------------------------------
  if (loading) return (
    <div className="root"><TopNav />
      <div className="page-scroll"><div className="history-empty">Loading…</div></div>
    </div>
  );

  if (error && !event) return (
    <div className="root"><TopNav />
      <div className="page-scroll"><div className="history-empty">{error}</div></div>
    </div>
  );

  return (
    <div className="root">
      <TopNav />

      {/* Header */}
      <div className="header">
        <div className="title-row">
          <div>
            <div className="t-breadcrumb">
              <Link to="/tournaments">Tournaments</Link>
              <span> / </span>
              <Link to={`/tournaments/${weekId}`}>{week?.name}</Link>
              <span> / </span>
              <span>{event?.category} {event?.ageGroup}</span>
            </div>
            <h1 className="title">{event?.category}</h1>
            <div className="subtitle">{event?.ageGroup} · {week?.name}</div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {isOwner && (
              <>
                <button className="action-btn primary"
                  onClick={() => { setEditingEntry(null); setShowAdd(true); }}>
                  + Add Player
                </button>
                <button className="action-btn" onClick={() => setShowBulk(true)}>
                  Bulk Import
                </button>
                {hasSeededPlayers && (
                  <button className="action-btn t-engine-btn"
                    onClick={handleAutoSeed} disabled={seeding}>
                    {seeding ? 'Seeding…' : '⚡ Auto-Seed'}
                  </button>
                )}
                {hasGaps && !byeCount && (
                  <button className="action-btn t-engine-btn"
                    onClick={handleFillByes} disabled={fillingByes}>
                    {fillingByes ? 'Filling…' : '+ Fill BYEs'}
                  </button>
                )}
                {byeCount > 0 && (
                  <button className="action-btn t-engine-btn" onClick={handleClearByes}>
                    Clear BYEs
                  </button>
                )}
                {entries.length > 0 && (
                  <button
                    className={'action-btn t-swap-btn' + (swapMode ? ' active' : '')}
                    onClick={toggleSwapMode}
                  >
                    {swapMode ? (selectedEntry ? `Swap: ${selectedEntry.familyName}…` : 'Click to swap') : '⇅ Swap'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Draw-type tabs */}
      {event?.hasQualifying && (
        <div className="t-draw-tabs">
          <button className={'t-draw-tab' + (drawType === 'main' ? ' active' : '')}
            onClick={() => { setDrawType('main'); setSwapMode(false); setSelectedEntry(null); }}>
            Main Draw ({event.drawSize})
          </button>
          <button className={'t-draw-tab' + (drawType === 'qualifying' ? ' active' : '')}
            onClick={() => { setDrawType('qualifying'); setSwapMode(false); setSelectedEntry(null); }}>
            Qualifying ({event.qualifyingSize || '—'})
          </button>
        </div>
      )}

      {/* View toggle + stats */}
      {entries.length > 0 && (
        <div className="t-view-bar">
          <div className="t-view-stats">
            <span>{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
            {byeCount > 0 && <span className="t-stat-bye"> · {byeCount} BYE{byeCount !== 1 ? 's' : ''}</span>}
            <span className="t-stat-gap"> · {maxPos - entries.length} slot{maxPos - entries.length !== 1 ? 's' : ''} open</span>
          </div>
          <div className="t-view-toggle">
            <button className={'t-vtab' + (viewMode === 'list' ? ' active' : '')}
              onClick={() => setViewMode('list')}>List</button>
            <button className={'t-vtab' + (viewMode === 'drawsheet' ? ' active' : '')}
              onClick={() => setViewMode('drawsheet')}>Draw Sheet</button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="t-entry-progress" style={{ paddingTop: entries.length > 0 ? 4 : 12 }}>
        <div className="t-entry-progress-label">
          <span><strong>{entries.length}</strong> / {maxPos} positions filled</span>
          <span className="t-entry-progress-pct">{fillPct}%</span>
        </div>
        <div className="t-progress-track">
          <div className="t-progress-fill" style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      {error && <div style={{ padding: '6px 16px', color: '#e05252', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>{error}</div>}
      {swapMode && (
        <div className="t-swap-hint">
          {selectedEntry
            ? `Click another player to swap with ${selectedEntry.familyName}.`
            : 'Click any player to select, then click another to swap positions.'}
          <button className="t-swap-cancel" onClick={toggleSwapMode}>Cancel</button>
        </div>
      )}

      {/* Content */}
      <div className="page-scroll">
        {entries.length === 0 ? (
          <div className="history-empty">
            {isOwner ? 'No players entered yet. Use + Add Player or Bulk Import.' : 'No players entered yet.'}
          </div>
        ) : viewMode === 'drawsheet' ? (
          <DrawSheet
            entries={sortedEntries}
            drawSize={maxPos}
            isOwner={isOwner}
            swapMode={swapMode}
            selectedEntry={selectedEntry}
            onSelectEntry={handleSelectForSwap}
          />
        ) : (
          <div className="t-entry-table-wrap">
            <table className="t-entry-table">
              <thead>
                <tr>
                  <th className="t-th-pos">Pos</th>
                  <th className="t-th-seed">Seed</th>
                  <th>{event?.isDoubles ? 'Team' : 'Player'}</th>
                  <th className="t-th-aita">AITA Reg</th>
                  <th className="t-th-state">State</th>
                  <th className="t-th-rank">Rank</th>
                  <th className="t-th-sc">SC</th>
                  {isOwner && !swapMode && <th className="t-th-actions"></th>}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isDoubles={event?.isDoubles}
                    isOwner={isOwner}
                    swapMode={swapMode}
                    selected={swapMode && selectedEntry?.id === entry.id}
                    onSelect={handleSelectForSwap}
                    onEdit={e => { setEditingEntry(e); setShowAdd(true); }}
                    onDelete={handleDeleteEntry}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddEntryModal
          event={event} week={week} drawType={drawType}
          editingEntry={editingEntry} existingEntries={entries}
          onSave={handleSaveEntry}
          onClose={() => { setShowAdd(false); setEditingEntry(null); }}
        />
      )}
      {showBulk && (
        <BulkImportModal
          event={event} drawType={drawType} existingEntries={entries}
          onImport={handleBulkImport}
          onClose={() => setShowBulk(false)}
        />
      )}
    </div>
  );
}
