import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import { applySeeding, buildByeEntries, buildR1Matches, swapPositions } from '../utils/drawEngine';
import { generateDrawSheetPDF } from '../utils/drawPdf';
import { checkAgeEligibility } from '../utils/eligibility';

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

// Alternates live at positions beyond the draw size — position order IS
// priority order (lowest = called first).
function nextAlternateSlot(entries, maxPos) {
  const taken = new Set(entries.filter(e => e.isAlternate).map(e => e.position));
  let p = maxPos + 1;
  while (taken.has(p)) p++;
  return p;
}

// Parse AITA acceptance list text.
// Supports two formats per line:
//   A) With explicit position:  Pos, FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode
//   B) Auto-position (in order): FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode
// Format A is auto-detected when the first column is a number.
// Lines starting with # are treated as comments and skipped.
// Blank lines and tab-separated data (copied from spreadsheets) are also handled.
function parseBulk(text, existingPositions, maxPos) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const entries = [];
  const errors = [];
  let autoPos = 1;
  while (existingPositions.has(autoPos) && autoPos <= maxPos) autoPos++;

  lines.forEach((line, idx) => {
    // Support both comma-separated and tab-separated (copy-paste from Excel/Sheets)
    const sep = line.includes('\t') ? '\t' : ',';
    const p = line.split(sep).map(x => x.trim());

    // Auto-detect format A: first token is a pure number (draw position)
    const firstNum = Number(p[0]);
    let pos, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode;

    if (p[0] !== '' && !isNaN(firstNum) && String(firstNum) === p[0]) {
      // Format A — explicit position
      pos = firstNum;
      [, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode] = p;
    } else {
      // Format B — auto-position
      pos = autoPos;
      [familyName, firstName, aitaReg, playerState, ranking, seed, statusCode] = p;
      autoPos++;
      while (existingPositions.has(autoPos) && autoPos <= maxPos) autoPos++;
    }

    familyName = (familyName || '').trim();
    if (!familyName) { errors.push(`Line ${idx + 1}: family name is required`); return; }

    entries.push({
      position: pos,
      familyName,
      firstName: (firstName || '').trim(),
      aitaReg: (aitaReg || '').trim(),
      playerState: (playerState || '').trim(),
      ranking: ranking ? Number(ranking) : null,
      seed: seed ? Number(seed) : null,
      statusCode: (statusCode || '').trim(),
    });
  });
  return { entries, errors };
}

// parseBulkFull — handles a combined acceptance-list paste that contains rows for
// MAIN DRAW, QUALIFYING DRAW, ALTERNATES and WITHDRAWAL LIST in a single block.
// Detects and skips header row; auto-corrects State ↔ AitaReg column swap.
function parseBulkFull(text) {
  const empty = { main: [], qualifying: [], alternates: [], withdrawal: [] };
  const rawLines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!rawLines.length) return { sections: empty, errors: [] };

  const sep = rawLines[0].includes('\t') ? '\t' : ',';

  // Skip header when the first token is non-numeric (e.g. "Pos", "FamilyName", "#")
  const firstTok = rawLines[0].split(sep)[0].trim();
  const hasHeader = isNaN(Number(firstTok)) || firstTok === '';
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;

  const sections = { main: [], qualifying: [], alternates: [], withdrawal: [] };
  const errors = [];

  dataLines.forEach((line, idx) => {
    const lineSep = line.includes('\t') ? '\t' : sep;
    const p = line.split(lineSep).map(x => x.trim());
    if (p.length < 2) return;

    // Detect explicit leading position (pure integer > 0)
    const hasPos = /^\d+$/.test(p[0]) && Number(p[0]) > 0;
    const explicitPos = hasPos ? Number(p[0]) : null;
    const f = hasPos ? p.slice(1) : p; // fields after stripping optional pos

    const familyName = (f[0] || '').trim();
    if (!familyName) { errors.push(`Line ${idx + 1}: family name required`); return; }

    const firstName  = (f[1] || '').trim();
    const col3       = (f[2] || '').trim();
    const col4       = (f[3] || '').trim();
    const rawRanking = (f[4] || '').trim();
    const rawSeed    = (f[5] || '').trim();
    const statusCode = (f[6] || '').trim();

    // Auto-detect State ↔ AitaReg column order:
    // AITA reg is always a 5–7 digit integer; State is alphabetic.
    let aitaReg, playerState;
    const c3Num = /^\d{4,7}$/.test(col3);
    const c4Num = /^\d{4,7}$/.test(col4);
    if (!c3Num && c4Num)      { playerState = col3; aitaReg = col4; } // State then AitaReg
    else if (c3Num && !c4Num) { aitaReg = col3; playerState = col4; } // AitaReg then State
    else                       { playerState = col3; aitaReg = col4; } // fallback

    const ranking = /^\d+$/.test(rawRanking) ? Number(rawRanking) : null;
    const seed    = /^\d+$/.test(rawSeed)    ? Number(rawSeed)    : null;

    // Route by StatusCode
    const sc = statusCode.toUpperCase();
    let section;
    if      (sc.includes('QUALIFYING'))                    section = 'qualifying';
    else if (sc.includes('ALTERNATE'))                     section = 'alternates';
    else if (sc.includes('WITHDRAW') || sc.includes('WD')) section = 'withdrawal';
    else                                                    section = 'main';

    const position = explicitPos ?? (sections[section].length + 1);
    sections[section].push({ position, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode });
  });

  return { sections, errors };
}

// ---------------------------------------------------------------------------
// BulkImportModal  — 5 tabs: Full List | Main Draw | Qualifying | Alternates | Withdrawal
// ---------------------------------------------------------------------------
const BULK_TABS = [
  { key: 'full',       label: 'Full List' },
  { key: 'main',       label: 'Main Draw' },
  { key: 'qualifying', label: 'Qualifying' },
  { key: 'alternates', label: 'Alternates' },
  { key: 'withdrawal', label: 'Withdrawal' },
];

const WD_TYPES = [
  { value: 'W',  label: 'W — On-time withdrawal' },
  { value: 'LW', label: 'LW — Late withdrawal' },
  { value: 'NS', label: 'NS — No show' },
];

// Shared paste-and-preview panel used by Main Draw, Qualifying, Alternates tabs
function ImportPane({ maxPos, startPos, existingPositions, isAlternate, onImport, saving, onClose }) {
  const remaining = isAlternate ? 999 : maxPos - (existingPositions.size);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [saveError, setSaveError] = useState('');

  function handlePreview() {
    // For alternates, override starting auto-position to startPos
    const fakeExisting = isAlternate
      ? new Set([...Array(startPos - 1)].map((_, i) => i + 1)) // pretend 1..startPos-1 are taken
      : existingPositions;
    const { entries, errors } = parseBulk(text, fakeExisting, isAlternate ? 9999 : maxPos);
    const finalEntries = entries.map(e => ({ ...e, isAlternate: isAlternate || false }));
    setPreview(finalEntries);
    setParseErrors(errors);
    setSaveError('');
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    try {
      await onImport(preview);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Import failed');
    }
  }

  const placeholder = isAlternate
    ? '# Alternates — positions auto-start after the draw size\n# Format: FamilyName, FirstName, AitaReg, State, Ranking\nKumari, Divya, 452301, RJ, 220\nPandey, Shreya, 448876, UP, 245'
    : '# Paste AITA acceptance list — with or without leading position number\n# FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode\nBhosale, Priya, 442320, TS, 45, 1,\nSharma, Ananya, 438901, MH, 78, 2,\nReddy, Kavya, 451234, AP, 112,,\n# With explicit position:\n# 40, Mehta, Riya, 449012, GJ, 156,,Q';

  return (
    <>
      <div className="t-bulk-help">
        <strong>Two formats:</strong>{' '}
        <code>FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode</code> (auto-position)
        {' '}or{' '}
        <code>Pos, FamilyName, ...</code> (explicit position).
        Tab-separated (Excel/Sheets) also works.
        {!isAlternate && <>{' '}<strong>{remaining > 0 ? remaining : 0}</strong> slot{remaining !== 1 ? 's' : ''} available.</>}
      </div>

      {!preview && (
        <>
          <textarea
            className="t-bulk-textarea"
            rows={11}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={placeholder}
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
          <div className="t-section-label">{preview.length} player{preview.length !== 1 ? 's' : ''} to import{isAlternate ? ' as Alternates' : ''}</div>
          <div className="t-entry-table-wrap">
            <table className="t-entry-table">
              <thead>
                <tr><th>Pos</th><th>Seed</th><th>Name</th><th>AITA Reg</th><th>State</th><th>Rank</th><th>SC</th></tr>
              </thead>
              <tbody>
                {preview.map((e, i) => (
                  <tr key={i}>
                    <td>{isAlternate ? `Alt ${e.position - (startPos - 1)}` : e.position}</td>
                    <td>{e.seed || '—'}</td>
                    <td>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</td>
                    <td>{e.aitaReg || '—'}</td>
                    <td>{e.playerState || '—'}</td>
                    <td>{e.ranking || '—'}</td>
                    <td>{e.statusCode ? <span className="t-sc-badge">{e.statusCode}</span> : '—'}</td>
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
          <button className="action-btn primary" onClick={handlePreview} disabled={!text.trim()}>Preview</button>
        )}
        {preview && (
          <>
            <button className="action-btn primary" disabled={saving || preview.length === 0} onClick={handleImport}>
              {saving ? 'Importing…' : `Import ${preview.length} Player${preview.length !== 1 ? 's' : ''}`}
            </button>
            <button className="action-btn" onClick={() => { setPreview(null); setSaveError(''); }}>Back</button>
          </>
        )}
        <button className="action-btn" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

// Withdrawal tab — shows existing entries as a checklist
function WithdrawalPane({ eventId, onWithdraw, saving, onClose }) {
  const [allEntries, setAllEntries]     = useState(null);
  const [loadError, setLoadError]       = useState('');
  const [selected, setSelected]         = useState(new Set());
  const [wdType, setWdType]             = useState('W');
  const [wdDate, setWdDate]             = useState(new Date().toISOString().slice(0, 10));
  const [saveError, setSaveError]       = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getDrawEntries(eventId, 'main'),
      api.getDrawEntries(eventId, 'qualifying'),
    ]).then(([main, qual]) => {
      if (!cancelled) {
        const active = [...main, ...qual].filter(e => !e.isWithdrawn && !e.isBye);
        setAllEntries(active);
      }
    }).catch(e => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [eventId]);

  function toggleEntry(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!allEntries) return;
    if (selected.size === allEntries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allEntries.map(e => e.id)));
    }
  }

  async function handleApply() {
    if (selected.size === 0) return;
    setSaveError('');
    try {
      await onWithdraw([...selected], wdType, wdDate);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Failed to apply withdrawals');
    }
  }

  if (loadError) return <div className="login-error" style={{ marginTop: 8 }}>{loadError}</div>;
  if (!allEntries) return <div className="history-empty">Loading entries…</div>;
  if (allEntries.length === 0) return <div className="history-empty">No active entries to withdraw.</div>;

  const mainEntries = allEntries.filter(e => e.drawType === 'main' && !e.isAlternate);
  const qualEntries = allEntries.filter(e => e.drawType === 'qualifying' && !e.isAlternate);
  const altEntries  = allEntries.filter(e => e.isAlternate);

  const renderGroup = (label, group) => group.length === 0 ? null : (
    <>
      <div className="t-section-label" style={{ margin: '10px 0 4px' }}>{label}</div>
      {group.map(e => (
        <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border,#2a2a2a)', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleEntry(e.id)} style={{ width: 15, height: 15, flexShrink: 0 }} />
          <span style={{ minWidth: 32, color: 'var(--text3,#777)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            {e.isAlternate ? `A${e.position - (e.drawType === 'main' ? (allEntries.find(x => x.drawType === 'main' && !x.isAlternate) ? 0 : 0) : 0)}` : `#${e.position}`}
          </span>
          {e.seed && <span className="t-sc-badge">[{e.seed}]</span>}
          <span style={{ flex: 1 }}>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</span>
          <span style={{ color: 'var(--text3,#777)', fontSize: 11 }}>{e.aitaReg || ''}</span>
          <span style={{ color: 'var(--text3,#777)', fontSize: 11 }}>{e.playerState || ''}</span>
          {e.statusCode && <span className="t-sc-badge">{e.statusCode}</span>}
        </label>
      ))}
    </>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox"
            checked={selected.size === allEntries.length && allEntries.length > 0}
            onChange={toggleAll}
          />
          Select all ({allEntries.length})
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={wdType} onChange={e => setWdType(e.target.value)} style={{ fontSize: 13 }}>
            {WD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="date" value={wdDate} onChange={e => setWdDate(e.target.value)} style={{ fontSize: 13 }} />
        </div>
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border,#2a2a2a)', borderRadius: 6, padding: '0 10px' }}>
        {renderGroup('Main Draw', mainEntries)}
        {renderGroup('Qualifying', qualEntries)}
        {renderGroup('Alternates', altEntries)}
      </div>

      {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button
          className="action-btn primary"
          style={{ background: selected.size > 0 ? '#7c3a00' : undefined, color: selected.size > 0 ? '#ffd9b0' : undefined }}
          disabled={saving || selected.size === 0}
          onClick={handleApply}
        >
          {saving ? 'Applying…' : `Apply Withdrawal to ${selected.size} Player${selected.size !== 1 ? 's' : ''}`}
        </button>
        <button className="action-btn" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

// Full-list paste pane — accepts a combined acceptance-list CSV and auto-routes by StatusCode
function FullListPane({ event, onImport, saving, onClose }) {
  const [text, setText]           = useState('');
  const [preview, setPreview]     = useState(null); // { main, qualifying, alternates, withdrawal }
  const [parseErrors, setErrors]  = useState([]);
  const [saveError, setSaveError] = useState('');

  function handlePreview() {
    const { sections, errors } = parseBulkFull(text);
    setPreview(sections);
    setErrors(errors);
    setSaveError('');
  }

  async function handleImport() {
    if (!preview) return;
    setSaveError('');
    try {
      await onImport(preview);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Import failed');
    }
  }

  const totalToImport = preview
    ? preview.main.length + preview.qualifying.length + preview.alternates.length
    : 0;

  const SectionTable = ({ label, arr }) => {
    if (!arr || !arr.length) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="t-section-label">{label} — {arr.length} player{arr.length !== 1 ? 's' : ''}</div>
        <div className="t-entry-table-wrap">
          <table className="t-entry-table">
            <thead><tr><th>Pos</th><th>Name</th><th>State</th><th>AITA Reg</th><th>Rank</th><th>Seed</th></tr></thead>
            <tbody>
              {arr.map((e, i) => (
                <tr key={i}>
                  <td>{e.position}</td>
                  <td>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</td>
                  <td>{e.playerState || '—'}</td>
                  <td>{e.aitaReg || '—'}</td>
                  <td>{e.ranking || '—'}</td>
                  <td>{e.seed || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="t-bulk-help">
        Paste the full AITA acceptance list in one go. Rows are auto-routed by the{' '}
        <strong>StatusCode</strong> column:{' '}
        <code>MAIN DRAW</code>, <code>QUALIFYING DRAW</code>, <code>ALTERNATES</code>, <code>WITHDRAWAL LIST</code>.
        {' '}Comma or tab-separated. Header row and <em>State ↔ AitaReg</em> column order are auto-detected.
        All four sections are imported — withdrawal list entries appear in the <strong>Withdrawal</strong> tab.
      </div>

      {!preview && (
        <>
          <textarea
            className="t-bulk-textarea"
            rows={11}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Pos,FamilyName,FirstName,State,AitaReg,Ranking,Seed,StatusCode\n1,Sharma,Ananya,Maharashtra,440372,10,,MAIN DRAW\n...\n1,Reddy,Kavya,Telangana,444849,56,,QUALIFYING DRAW\n...\n1,Kumari,Divya,Karnataka,446519,702,,ALTERNATES\n...\n1,Pandey,Sidhhi,Uttar Pradesh,441965,3,,WITHDRAWAL LIST'}
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
        <div className="t-bulk-preview" style={{ maxHeight: 340, overflowY: 'auto' }}>
          <SectionTable label="Main Draw"  arr={preview.main} />
          <SectionTable label="Qualifying" arr={preview.qualifying} />
          <SectionTable label="Alternates" arr={preview.alternates} />
          {preview.withdrawal.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="t-section-label">Withdrawal List — {preview.withdrawal.length} player{preview.withdrawal.length !== 1 ? 's' : ''}</div>
              <div className="t-entry-table-wrap">
                <table className="t-entry-table">
                  <thead><tr><th>#</th><th>Name</th><th>State</th><th>AITA Reg</th><th>Rank</th></tr></thead>
                  <tbody>
                    {preview.withdrawal.map((e, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</td>
                        <td>{e.playerState || '—'}</td>
                        <td>{e.aitaReg || '—'}</td>
                        <td>{e.ranking || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {saveError && <div className="login-error" style={{ marginTop: 8 }}>{saveError}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {!preview && (
          <button className="action-btn primary" onClick={handlePreview} disabled={!text.trim()}>Preview</button>
        )}
        {preview && (
          <>
            <button className="action-btn primary" disabled={saving || totalToImport === 0} onClick={handleImport}>
              {saving ? 'Importing…' : `Import ${totalToImport} Player${totalToImport !== 1 ? 's' : ''}`}
            </button>
            <button className="action-btn" onClick={() => { setPreview(null); setSaveError(''); }}>Back</button>
          </>
        )}
        <button className="action-btn" onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

function BulkImportModal({ event, drawType, existingEntries, onImport, onWithdraw, onClose }) {
  // Always open on Full List tab — user can switch to per-section tabs if needed
  const [activeTab, setActiveTab] = useState('full');
  const [saving, setSaving] = useState(false);

  // Per-tab derived values
  const mainMax  = event.drawSize || 32;
  const qualMax  = event.qualifyingSize || 32;
  const altStart = mainMax + 1; // alternates live after the main draw

  const mainExisting = new Set(
    existingEntries.filter(e => e.drawType === 'main' && !e.isAlternate && e.position <= mainMax).map(e => e.position)
  );
  const qualExisting = new Set(
    existingEntries.filter(e => e.drawType === 'qualifying' && !e.isAlternate && e.position <= qualMax).map(e => e.position)
  );

  // Per-section import (used by Main Draw / Qualifying / Alternates tabs)
  async function handlePaneImport(entries) {
    setSaving(true);
    try {
      if (activeTab === 'main')       await onImport(entries, 'main',       { isAlternate: false });
      if (activeTab === 'qualifying') await onImport(entries, 'qualifying', { isAlternate: false });
      if (activeTab === 'alternates') await onImport(entries, 'main',       { isAlternate: true });
    } finally {
      setSaving(false);
    }
  }

  // Full-list import — routes each section to the right draw type
  async function handleFullImport(sections) {
    setSaving(true);
    try {
      const maxMainPos = sections.main.length > 0
        ? Math.max(...sections.main.map(e => e.position))
        : mainMax;
      if (sections.main.length > 0) {
        await onImport(sections.main, 'main', { isAlternate: false });
      }
      if (sections.qualifying.length > 0) {
        await onImport(sections.qualifying, 'qualifying', { isAlternate: false });
      }
      if (sections.alternates.length > 0) {
        const altCsvMin = Math.min(...sections.alternates.map(e => e.position));
        const altOffset = maxMainPos + 1;
        const alts = sections.alternates.map(e => ({
          ...e,
          position: e.position - altCsvMin + altOffset,
          isAlternate: true,
        }));
        await onImport(alts, 'main', { isAlternate: true });
      }
      if (sections.withdrawal.length > 0) {
        // Re-sequence from 1 so positions are compact and don't conflict with other draw types
        const wdEntries = sections.withdrawal.map((e, i) => ({ ...e, position: i + 1 }));
        await onImport(wdEntries, 'withdrawal', {});
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw(ids, type, date) {
    setSaving(true);
    try { await onWithdraw(ids, type, date); }
    finally { setSaving(false); }
  }

  const tabs = BULK_TABS.filter(t => t.key !== 'qualifying' || event.hasQualifying);

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal t-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">Bulk Import / Withdrawal</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="t-view-toggle" style={{ marginBottom: 14 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              className={'t-vtab' + (activeTab === t.key ? ' active' : '')}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'full' && (
          <FullListPane
            event={event}
            onImport={handleFullImport}
            saving={saving}
            onClose={onClose}
          />
        )}
        {activeTab === 'main' && (
          <ImportPane
            maxPos={mainMax}
            startPos={1}
            existingPositions={mainExisting}
            isAlternate={false}
            onImport={handlePaneImport}
            saving={saving}
            onClose={onClose}
          />
        )}
        {activeTab === 'qualifying' && event.hasQualifying && (
          <ImportPane
            maxPos={qualMax}
            startPos={1}
            existingPositions={qualExisting}
            isAlternate={false}
            onImport={handlePaneImport}
            saving={saving}
            onClose={onClose}
          />
        )}
        {activeTab === 'alternates' && (
          <ImportPane
            maxPos={9999}
            startPos={altStart}
            existingPositions={new Set([...Array(altStart - 1)].map((_, i) => i + 1))}
            isAlternate={true}
            onImport={handlePaneImport}
            saving={saving}
            onClose={onClose}
          />
        )}
        {activeTab === 'withdrawal' && (
          <WithdrawalPane
            eventId={event.id}
            onWithdraw={handleWithdraw}
            saving={saving}
            onClose={onClose}
          />
        )}
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

  // Alternates occupy positions beyond the draw size — auto-assign/keep that
  // slot instead of the normal 1..maxPos position field.
  useEffect(() => {
    if (form.isAlternate && !editingEntry) {
      setForm(prev => ({ ...prev, position: nextAlternateSlot(existingEntries, maxPos) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isAlternate]);

  // Debounced platform search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
          const gender = (event?.category?.toLowerCase().includes('girl') || event?.category?.toLowerCase().includes('women')) ? 'F' : 'M';
          setSearchResults(await api.searchPlayers(searchQuery, event?.ageGroup, gender));
        }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  function fillFromPlayer(player) {
    // player may come from user_profiles (has displayName) or aita_players (has familyName/firstName directly)
    const familyName = player.familyName
      || (() => { const p = (player.displayName || '').trim().split(' '); return p.length > 1 ? p[p.length - 1] : p[0]; })();
    const firstName = player.firstName !== undefined
      ? (player.firstName || '')
      : (() => { const p = (player.displayName || '').trim().split(' '); return p.length > 1 ? p.slice(0, -1).join(' ') : ''; })();
    setForm(prev => ({
      ...prev,
      playerId: player.id || null,
      familyName,
      firstName,
      aitaReg: player.aitaReg || '',
      playerState: player.stateAbbr || '',
      ranking: player.ranking || '',
      dateOfBirth: player.dateOfBirth || prev.dateOfBirth,
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

    let posNum;
    if (form.isAlternate) {
      posNum = editingEntry ? editingEntry.position : nextAlternateSlot(existingEntries, maxPos);
    } else {
      posNum = Number(form.position);
      if (!posNum || posNum < 1 || posNum > maxPos) {
        setError(`Position must be 1 – ${maxPos}.`); return;
      }
      const conflict = existingEntries.find(
        en => en.position === posNum && (!editingEntry || en.id !== editingEntry.id)
      );
      if (conflict) {
        setError(`Position ${posNum} is already taken by ${conflict.familyName}.`); return;
      }
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

    // Age eligibility check (§4.2) — blocked only when playing down with flag off
    if (form.dateOfBirth && event.ageGroup && week) {
      const year = new Date(week.startDate || new Date()).getFullYear();
      const ageCheck = checkAgeEligibility(
        form.dateOfBirth, event.ageGroup, year,
        week.playingUpAllowed, week.playingDownAllowed,
      );
      if (!ageCheck.allowed) { setError(ageCheck.reason); return; }
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
                disabled={form.isAlternate}
                onChange={e => set('position', e.target.value)}
              />
              {form.isAlternate && (
                <div className="t-alt-pos-hint">Alternate #{form.position - maxPos}</div>
              )}
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
                {searchResults.map((p, i) => (
                  <button
                    key={p.id || p.aitaReg || i}
                    type="button"
                    className="t-search-result-item"
                    onClick={() => fillFromPlayer(p)}
                  >
                    <span className="t-sr-name">
                      {p.familyName ? `${p.familyName}${p.firstName ? ', ' + p.firstName : ''}` : p.displayName}
                      {p._source === 'aita' && <span className="t-sr-aita-badge">AITA</span>}
                    </span>
                    <span className="t-sr-meta">
                      {[p.aitaReg, p.stateAbbr || p.state, p.ranking && `Rank ${p.ranking}`, p.ageGroup].filter(Boolean).join(' · ')}
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
function EntryRow({ entry, isDoubles, isOwner, swapMode, selected, onSelect, onEdit, onDelete, onWithdraw }) {
  const isBye = entry.isBye;
  const isWithdrawn = entry.isWithdrawn;
  return (
    <tr
      className={
        't-entry-row' +
        (isBye ? ' t-entry-bye' : '') +
        (isWithdrawn ? ' t-entry-withdrawn' : '') +
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
              {isWithdrawn && <span className="t-wd-label"> WD</span>}
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
          {!isBye && !isWithdrawn && (
            <button className="t-icon-btn t-icon-btn-wd" onClick={() => onWithdraw(entry)} title="Withdraw">↯</button>
          )}
          <button className="t-icon-btn t-icon-btn-del" onClick={() => onDelete(entry.id)} title="Remove">✕</button>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// AlternateRow  (alternates list — positions beyond the draw size)
// ---------------------------------------------------------------------------
function AlternateRow({ entry, maxPos, isOwner, onDelete }) {
  return (
    <tr className="t-entry-row">
      <td className="t-entry-pos">#{entry.position - maxPos}</td>
      <td className="t-entry-name">
        <div className="t-entry-name-main">
          {entry.familyName}
          {entry.firstName ? <span className="t-entry-first">, {entry.firstName}</span> : null}
        </div>
      </td>
      <td className="t-entry-aita">{entry.aitaReg || <span className="t-entry-dash">—</span>}</td>
      <td className="t-entry-state">{entry.playerState || <span className="t-entry-dash">—</span>}</td>
      <td className="t-entry-rank">{entry.ranking || <span className="t-entry-dash">—</span>}</td>
      {isOwner && (
        <td className="t-entry-actions">
          <button className="t-icon-btn t-icon-btn-del" onClick={() => onDelete(entry.id)} title="Remove">✕</button>
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// WithdrawModal  (Phase 10 — withdraw a player, optionally call in a
// replacement: an alternate before play starts, a lucky loser after)
// ---------------------------------------------------------------------------
function WithdrawModal({ entry, event, drawType, matches, alternateEntries, luckyLosers, onNoReplacement, onCallInAlternate, onCallInLuckyLoser, onClose }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasPlayed = matches.some(
    m => m.status === 'complete' && (m.entry1Id === entry.id || m.entry2Id === entry.id)
  );
  const waitingLuckyLosers = (luckyLosers || []).filter(ll => ll.status === 'waiting');

  const showAlternates   = drawType === 'main' && !hasPlayed;
  const showLuckyLosers  = drawType === 'main' && hasPlayed && event.hasQualifying;

  async function run(action) {
    setSaving(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err.message || 'Action failed');
      setSaving(false);
    }
  }

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal" onClick={e => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">
            Withdraw {entry.familyName}{entry.firstName ? `, ${entry.firstName}` : ''}
          </span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {hasPlayed && (
          <div className="t-withdraw-note">
            This player has already completed a match — an alternate cannot fill this spot.
          </div>
        )}

        {showAlternates && (
          <>
            <div className="t-section-label">Call In an Alternate</div>
            {alternateEntries.length === 0 ? (
              <div className="t-withdraw-empty">No alternates entered for this draw.</div>
            ) : (
              <div className="t-withdraw-list">
                {alternateEntries.map(alt => (
                  <div key={alt.id} className="t-withdraw-item">
                    <span>{alt.familyName}{alt.firstName ? `, ${alt.firstName}` : ''}</span>
                    <button
                      className="action-btn primary"
                      disabled={saving}
                      onClick={() => run(() => onCallInAlternate(alt))}
                    >
                      Call In
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {showLuckyLosers && (
          <>
            <div className="t-section-label">Call In a Lucky Loser</div>
            {waitingLuckyLosers.length === 0 ? (
              <div className="t-withdraw-empty">
                No lucky losers available. Run Random Draw on the Lucky Losers tab once qualifying is decided.
              </div>
            ) : (
              <div className="t-withdraw-list">
                {waitingLuckyLosers.map(ll => (
                  <div key={ll.id} className="t-withdraw-item">
                    <span>#{ll.priority} — {ll.entry?.familyName}{ll.entry?.firstName ? `, ${ll.entry.firstName}` : ''}</span>
                    <button
                      className="action-btn primary"
                      disabled={saving}
                      onClick={() => run(() => onCallInLuckyLoser(ll))}
                    >
                      Call In
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="action-btn" disabled={saving} onClick={() => run(onNoReplacement)}>
            {hasPlayed ? 'Grant Walkover to Opponent' : 'Withdraw — No Replacement'}
          </button>
          <button className="action-btn" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LuckyLosersPanel  (Phase 10 — random-draw priority pool + call-in)
// ---------------------------------------------------------------------------
function LuckyLosersPanel({ luckyLosers, mainEntries, isOwner, drawing, onRandomDraw, onCallIn }) {
  const [pickedTarget, setPickedTarget] = useState({});

  const unresolvedWithdrawn = mainEntries.filter(e => e.isWithdrawn && !e.isAlternate);
  const hasAny = luckyLosers.length > 0;

  return (
    <div className="page-scroll">
      {isOwner && (
        <div style={{ padding: '8px 16px' }}>
          <button className="action-btn t-engine-btn" onClick={onRandomDraw} disabled={drawing}>
            {drawing ? 'Drawing…' : hasAny ? '↺ Re-Draw' : '🎲 Random Draw'}
          </button>
        </div>
      )}
      {luckyLosers.length === 0 ? (
        <div className="history-empty">
          No lucky losers drawn yet. Run Random Draw once the qualifying deciding round is complete.
        </div>
      ) : (
        <div className="t-entry-table-wrap">
          <table className="t-entry-table">
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>AITA Reg</th><th>Status</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {luckyLosers.map(ll => (
                <tr key={ll.id}>
                  <td>{ll.priority}</td>
                  <td>{ll.entry?.familyName}{ll.entry?.firstName ? `, ${ll.entry.firstName}` : ''}</td>
                  <td>{ll.entry?.aitaReg || <span className="t-entry-dash">—</span>}</td>
                  <td>
                    {ll.status === 'called_in'
                      ? <span className="t-ll-status-badge t-ll-called">Called In</span>
                      : <span className="t-ll-status-badge t-ll-waiting">Waiting</span>}
                  </td>
                  {isOwner && (
                    <td>
                      {ll.status === 'waiting' && (
                        unresolvedWithdrawn.length === 0 ? (
                          <span className="t-entry-dash">No open slot</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select
                              value={pickedTarget[ll.id] || ''}
                              onChange={e => setPickedTarget(prev => ({ ...prev, [ll.id]: e.target.value }))}
                            >
                              <option value="">Fill which slot?</option>
                              {unresolvedWithdrawn.map(e => (
                                <option key={e.id} value={e.id}>Pos {e.position} — {e.familyName}</option>
                              ))}
                            </select>
                            <button
                              className="action-btn primary"
                              disabled={!pickedTarget[ll.id]}
                              onClick={() => onCallIn(pickedTarget[ll.id], ll)}
                            >
                              Call In
                            </button>
                          </div>
                        )
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrawLinePlayer  (one player line inside a draw-sheet match box)
// ---------------------------------------------------------------------------
function DrawLinePlayer({ entry, pos, selected, swapMode, onClick }) {
  const isBye   = !entry || entry.isBye;
  const isEmpty = !entry;
  const isWithdrawn = entry?.isWithdrawn;
  return (
    <div
      className={
        't-ds-player' +
        (isBye   ? ' t-ds-bye'      : '') +
        (isEmpty  ? ' t-ds-empty'    : '') +
        (isWithdrawn ? ' t-ds-withdrawn' : '') +
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
      {isWithdrawn && <span className="t-wd-label"> WD</span>}
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
// Helpers
// ---------------------------------------------------------------------------
function roundLabel(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-Finals';
  if (fromEnd === 2) return 'Quarter-Finals';
  return `R${round}`;
}

// ---------------------------------------------------------------------------
// ScoreModal
// ---------------------------------------------------------------------------
const OUTCOME_TYPES = ['score', 'walkover', 'retirement', 'default'];

function ScoreModal({ match, entry1, entry2, onSave, onClose }) {
  const [outcomeType, setOutcomeType] = useState(match.outcomeType || 'score');
  const [score,       setScore]       = useState(match.score || '');
  const [winnerId,    setWinnerId]    = useState(match.winnerEntryId || '');
  const [umpire,      setUmpire]      = useState(match.umpire || '');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const p1Name = entry1 ? `${entry1.familyName}${entry1.firstName ? ', ' + entry1.firstName : ''}${entry1.seed ? ` [${entry1.seed}]` : ''}` : '—';
  const p2Name = entry2 ? `${entry2.familyName}${entry2.firstName ? ', ' + entry2.firstName : ''}${entry2.seed ? ` [${entry2.seed}]` : ''}` : '—';

  async function handleSave(e) {
    e.preventDefault();
    if (!winnerId) { setError('Select the winner.'); return; }
    if (outcomeType === 'score' && !score.trim()) { setError('Enter the score.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(match.id, {
        score: outcomeType === 'score' ? score.trim() : null,
        winnerEntryId: winnerId,
        outcomeType,
        status: 'complete',
        umpire: umpire.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save result');
      setSaving(false);
    }
  }

  return (
    <div className="t-modal-overlay" onClick={onClose}>
      <div className="t-modal" onClick={e => e.stopPropagation()}>
        <div className="t-modal-header">
          <span className="t-modal-title">Enter Result</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Match players */}
        <div className="t-score-matchup">
          <div className="t-score-player">{p1Name}</div>
          <div className="t-score-vs">vs</div>
          <div className="t-score-player">{p2Name}</div>
        </div>

        <form onSubmit={handleSave} className="t-create-form">
          {/* Outcome type */}
          <div className="field">
            <label>Outcome</label>
            <div className="t-outcome-btns">
              {OUTCOME_TYPES.map(o => (
                <button key={o} type="button"
                  className={'t-outcome-btn' + (outcomeType === o ? ' active' : '')}
                  onClick={() => setOutcomeType(o)}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Score (shown only for "score" outcome) */}
          {outcomeType === 'score' && (
            <div className="field">
              <label>Score</label>
              <input
                value={score}
                onChange={e => setScore(e.target.value)}
                placeholder="e.g. 6-3, 7-5  or  6-4, 3-6, 6-2"
                autoFocus
              />
            </div>
          )}

          {/* Winner */}
          <div className="field">
            <label>Winner</label>
            <div className="t-winner-btns">
              {entry1 && !entry1.isBye && (
                <button type="button"
                  className={'t-winner-btn' + (winnerId === match.entry1Id ? ' active' : '')}
                  onClick={() => setWinnerId(match.entry1Id)}>
                  {p1Name}
                </button>
              )}
              {entry2 && !entry2.isBye && (
                <button type="button"
                  className={'t-winner-btn' + (winnerId === match.entry2Id ? ' active' : '')}
                  onClick={() => setWinnerId(match.entry2Id)}>
                  {p2Name}
                </button>
              )}
            </div>
          </div>

          {/* Umpire */}
          <div className="field">
            <label>Umpire (optional)</label>
            <input
              value={umpire}
              onChange={e => setUmpire(e.target.value)}
              placeholder="Umpire name"
            />
          </div>

          {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="action-btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Result'}
            </button>
            <button type="button" className="action-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BracketMatchCard
// ---------------------------------------------------------------------------
function BracketMatchCard({ match, entry1, entry2, isClickable, onClick }) {
  const isBye1 = entry1?.isBye;
  const isBye2 = entry2?.isBye;

  function playerLine(entry, entryId, isWinner) {
    const name = !entry
      ? <span className="t-bmc-empty">TBD</span>
      : entry.isBye
        ? <span className="t-bmc-bye">BYE</span>
        : <>{entry.seed && <span className="t-bmc-seed">[{entry.seed}]</span>}
            <span className={`t-bmc-name${isWinner ? ' t-bmc-winner' : ''}`}>
              {entry.familyName}{entry.firstName ? ', ' + entry.firstName : ''}
            </span>
            {entry.isWithdrawn && <span className="t-wd-label"> WD</span>}
            {entry.playerState && <span className="t-bmc-state">{entry.playerState}</span>}
          </>;
    return (
      <div className={`t-bmc-player${isWinner ? ' t-bmc-player-won' : ''}${entry?.isBye ? ' t-bmc-player-bye' : ''}`}>
        {name}
      </div>
    );
  }

  return (
    <div
      className={
        't-bmc' +
        (isClickable ? ' t-bmc-clickable' : '') +
        (match.status === 'complete' ? ' t-bmc-complete' : '')
      }
      onClick={isClickable ? onClick : undefined}
    >
      {playerLine(entry1, match.entry1Id, match.winnerEntryId === match.entry1Id)}
      <div className="t-bmc-divider" />
      {playerLine(entry2, match.entry2Id, match.winnerEntryId === match.entry2Id)}
      {match.score && (
        <div className="t-bmc-score">{match.score}</div>
      )}
      {match.outcomeType && match.outcomeType !== 'score' && match.status === 'complete' && (
        <div className="t-bmc-outcome">{match.outcomeType.toUpperCase()}</div>
      )}
      {isClickable && !match.winnerEntryId && !isBye1 && !isBye2 && (
        <div className="t-bmc-cta">+ Score</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BracketView  — full multi-round bracket (absolute positioned)
// ---------------------------------------------------------------------------
const SLOT_H = 88;   // height each R1 match occupies (px)
const CARD_H = 80;   // height of the match card itself (px)
const COL_W  = 236;  // column width (px)
const COL_GAP = 40;  // gap between columns (px)

function BracketView({ matches, entries, drawSize, totalRounds, isOwner, onScore }) {
  const entryMap = new Map(entries.map(e => [e.id, e]));

  const byRound = {};
  for (let r = 1; r <= totalRounds; r++) {
    byRound[r] = (matches.filter(m => m.round === r) || [])
      .sort((a, b) => a.matchSlot - b.matchSlot);
  }

  const totalH = (drawSize / 2) * SLOT_H;
  const totalW = totalRounds * COL_W + (totalRounds - 1) * COL_GAP;

  return (
    <div className="t-bracket-wrap">
      {/* Round labels */}
      <div className="t-bracket-labels" style={{ width: totalW }}>
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
          <div key={r} className="t-bracket-label"
            style={{ width: COL_W, marginLeft: r === 1 ? 0 : COL_GAP }}>
            {roundLabel(r, totalRounds)}
          </div>
        ))}
      </div>

      {/* Bracket grid */}
      <div className="t-bracket-grid" style={{ width: totalW, height: totalH }}>
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
          const slotH  = Math.pow(2, round - 1) * SLOT_H;
          const colLeft = (round - 1) * (COL_W + COL_GAP);
          const roundMatches = byRound[round] || [];

          return roundMatches.map(match => {
            const top    = (match.matchSlot - 1) * slotH + (slotH - CARD_H) / 2;
            const entry1 = entryMap.get(match.entry1Id);
            const entry2 = entryMap.get(match.entry2Id);

            // Clickable if organizer, not yet complete, and has at least one real player
            const hasPlayers = (match.entry1Id || match.entry2Id);
            const isClickable = isOwner && match.status !== 'complete' && !!hasPlayers;

            return (
              <div key={match.id} style={{ position: 'absolute', top, left: colLeft }}>
                <BracketMatchCard
                  match={match}
                  entry1={entry1}
                  entry2={entry2}
                  isClickable={isClickable}
                  onClick={() => onScore(match)}
                />
              </div>
            );
          });
        })}
      </div>
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
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'qualifying' | 'lucky_losers'
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // View / interaction state
  const [viewMode,       setViewMode]       = useState('list');   // 'list' | 'drawsheet' | 'bracket'
  const [swapMode,       setSwapMode]       = useState(false);
  const [selectedEntry,  setSelectedEntry]  = useState(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [editingEntry,   setEditingEntry]   = useState(null);
  const [showBulk,       setShowBulk]       = useState(false);
  const [seeding,        setSeeding]        = useState(false);

  // Phase 5 — bracket + score state
  const [matches,      setMatches]      = useState([]);
  const [generating,   setGenerating]   = useState(false);
  const [scoringMatch, setScoringMatch] = useState(null);
  const [fillingByes,    setFillingByes]    = useState(false);

  // Phase 10 — withdrawals, alternates, lucky losers
  const [withdrawingEntry,  setWithdrawingEntry]  = useState(null);
  const [luckyLosers,       setLuckyLosers]       = useState([]);
  const [drawingLL,         setDrawingLL]         = useState(false);
  const [withdrawnEntries,  setWithdrawnEntries]  = useState([]); // draw_type='withdrawal'

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

  // Load matches whenever event status is past 'setup'
  useEffect(() => {
    if (!event || event.status === 'setup') return;
    let cancelled = false;
    api.getEventMatches(eventId, drawType)
      .then(data => {
        if (!cancelled) {
          setMatches(data);
          if (data.length > 0) setViewMode('bracket');
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [eventId, drawType, event]);

  // Load withdrawal-list entries (draw_type='withdrawal') independently of drawType
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    api.getDrawEntries(eventId, 'withdrawal')
      .then(data => { if (!cancelled) setWithdrawnEntries(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, event]);

  // Load the lucky-loser pool whenever this event has qualifying — kept
  // independent of drawType/activeTab so the Withdraw modal can always see it.
  useEffect(() => {
    if (!event?.hasQualifying) return;
    let cancelled = false;
    api.getLuckyLosers(eventId)
      .then(data => { if (!cancelled) setLuckyLosers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, event?.hasQualifying]);

  const isOwner     = !!(week && user && week.createdBy === user.id);
  const maxPos      = event ? (drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32)) : 0;
  const numSeeds    = event?.numSeeds || 4;
  const totalRounds = maxPos > 0 ? Math.ceil(Math.log2(maxPos)) : 0;

  // Phase 6 — qualifying completion check
  const qualDecidingRound = (event?.qualifyingSize && event?.qualifyingSpots)
    ? Math.round(Math.log2(event.qualifyingSize / event.qualifyingSpots))
    : 0;
  const qualDecidingMatches = matches.filter(m => m.round === qualDecidingRound);
  const qualComplete = drawType === 'qualifying'
    && qualDecidingRound > 0
    && qualDecidingMatches.length === event?.qualifyingSpots
    && qualDecidingMatches.every(m => m.status === 'complete');
  // Alternates live at positions beyond the draw size — keep them out of the
  // main bracket entries (fill %, BYE count, drawFull, DrawSheet/Bracket math).
  const mainEntries      = entries.filter(e => e.position <= maxPos);
  const alternateEntries = entries.filter(e => e.position > maxPos)
    .sort((a, b) => a.position - b.position);
  const sortedEntries = [...mainEntries].sort((a, b) => a.position - b.position);
  const playerCount = mainEntries.filter(e => !e.isBye).length;
  const byeCount    = mainEntries.filter(e => e.isBye).length;
  const fillPct     = maxPos > 0 ? Math.min(Math.round(mainEntries.length / maxPos * 100), 100) : 0;
  const hasSeededPlayers = mainEntries.some(e => e.seed && !e.isBye);
  const hasGaps     = mainEntries.length < maxPos;
  const drawFull    = mainEntries.length === maxPos && maxPos > 0;

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

  async function handleBulkImport(importedEntries, importDrawType, options = {}) {
    const dt = importDrawType || drawType;
    const mapped = importedEntries.map(e => ({ ...e, isAlternate: options.isAlternate || false }));
    const created = await api.bulkAddDrawEntries(eventId, dt, mapped);
    if (dt === 'withdrawal') {
      setWithdrawnEntries(prev => [...prev, ...created].sort((a, b) => a.position - b.position));
    } else {
      setEntries(prev => [...prev, ...created].sort((a, b) => a.position - b.position));
    }
  }

  async function handleBulkWithdraw(entryIds, withdrawalType, withdrawalDate) {
    const updated = await api.bulkSetWithdrawn(entryIds, withdrawalType, withdrawalDate);
    setEntries(prev => prev.map(e => updated.find(u => u.id === e.id) || e));
  }

  // ---- AUTO-SEED -----------------------------------------------------------
  async function handleAutoSeed() {
    if (!window.confirm(
      'Auto-Seed will rearrange ALL player positions to match ITF seeding rules. Continue?'
    )) return;
    setSeeding(true);
    setError('');
    try {
      // saveDrawEntries replaces ALL rows for this draw — reseed only the
      // real bracket positions, then carry the (untouched) alternates along.
      const reseeded = applySeeding(mainEntries, maxPos, numSeeds);
      const saved    = await api.saveDrawEntries(eventId, drawType, [...reseeded, ...alternateEntries]);
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

  // ---- GENERATE BRACKET ---------------------------------------------------
  async function handleGenerateBracket() {
    const msg = matches.length > 0
      ? 'Regenerate bracket? All existing match results will be lost.'
      : 'Generate bracket from the current draw positions?';
    if (!window.confirm(msg)) return;
    setGenerating(true);
    setError('');
    try {
      const sorted = [...entries].sort((a, b) => a.position - b.position);
      const initialized = await api.initializeEventMatches(eventId, drawType, sorted);

      // Auto-advance BYE matches (R1 only)
      const entryMap = new Map(entries.map(e => [e.id, e]));
      const r1 = initialized.filter(m => m.round === 1);
      await Promise.all(r1.map(async match => {
        const e1 = entryMap.get(match.entry1Id);
        const e2 = entryMap.get(match.entry2Id);
        const byeWin = (e1?.isBye && e2 && !e2.isBye) ? e2 : (e2?.isBye && e1 && !e1.isBye) ? e1 : null;
        if (byeWin) {
          await api.updateMatchScore(match.id, {
            winnerEntryId: byeWin.id, outcomeType: 'walkover', status: 'complete', score: null, umpire: null,
          });
          await api.advanceWinner(eventId, drawType, 1, match.matchSlot, byeWin.id);
        }
      }));

      // Mark event as draw_ready
      const updated = await api.updateEvent(eventId, { status: 'draw_ready' });
      setEvent(updated);

      // Reload fresh matches (includes BYE advancements)
      const fresh = await api.getEventMatches(eventId, drawType);
      setMatches(fresh);
      setViewMode('bracket');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ---- SCORE A MATCH -------------------------------------------------------
  async function handleScoreMatch(matchId, { score, winnerEntryId, outcomeType, status, umpire }) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    await api.updateMatchScore(matchId, { score, winnerEntryId, outcomeType, status, umpire });

    // Advance winner (not for the final)
    if (match.round < totalRounds) {
      await api.advanceWinner(eventId, drawType, match.round, match.matchSlot, winnerEntryId);
    }

    // Set event status to in_progress on first score
    if (event.status === 'draw_ready') {
      const ev = await api.updateEvent(eventId, { status: 'in_progress' });
      setEvent(ev);
    }

    // Reload matches to reflect DB state (especially next-round entry updates)
    const fresh = await api.getEventMatches(eventId, drawType);
    setMatches(fresh);
    setScoringMatch(null);
  }

  // ---- PROMOTE QUALIFIERS (Phase 6) ----------------------------------------
  async function handlePromoteQualifiers() {
    if (!window.confirm(
      `Promote ${event.qualifyingSpots} qualifier(s) to the main draw?\n` +
      'This will overwrite Q placeholder entries in the main draw.'
    )) return;
    setError('');
    try {
      const winners = await api.getQualifyingWinners(eventId);
      if (!winners) { setError('Not all qualifying matches are complete.'); return; }
      await api.promoteQualifiers(eventId, winners);
      // Switch to main draw tab
      setDrawType('main');
      setMatches([]);
      setViewMode('list');
      setSwapMode(false);
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    }
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

  // ---- WITHDRAWALS / ALTERNATES / LUCKY LOSERS (Phase 10) -------------------
  async function reloadAfterWithdrawal() {
    const [freshEntries, freshMatches] = await Promise.all([
      api.getDrawEntries(eventId, drawType),
      api.getEventMatches(eventId, drawType),
    ]);
    setEntries(freshEntries);
    setMatches(freshMatches);
    if (event?.hasQualifying) {
      api.getLuckyLosers(eventId).then(setLuckyLosers).catch(() => {});
    }
  }

  async function handleWithdrawNoReplacement() {
    const target = withdrawingEntry;
    await api.setEntryWithdrawn(target.id, true);
    const walkover = await api.processWalkoverIfNeeded(eventId, drawType, target.id);
    if (walkover && walkover.round < totalRounds) {
      await api.advanceWinner(eventId, drawType, walkover.round, walkover.matchSlot, walkover.winnerEntryId);
    }
    await api.clearScheduleForEntry(target.id);
    await reloadAfterWithdrawal();
  }

  async function handleCallInAlternate(altEntry) {
    const target = withdrawingEntry;
    await api.callInReplacement(target.id, altEntry, 'alternate');
    await api.clearScheduleForEntry(target.id);
    await reloadAfterWithdrawal();
  }

  async function handleCallInLuckyLoser(ll) {
    const target = withdrawingEntry;
    await api.callInReplacement(target.id, ll.entry, 'lucky_loser');
    await api.clearScheduleForEntry(target.id);
    await reloadAfterWithdrawal();
  }

  async function handleRandomDrawLuckyLosers() {
    setDrawingLL(true);
    setError('');
    try {
      await api.randomizeLuckyLosers(eventId);
      const ll = await api.getLuckyLosers(eventId);
      setLuckyLosers(ll);
    } catch (err) {
      setError(err.message);
    } finally {
      setDrawingLL(false);
    }
  }

  async function handleCallInLuckyLoserFromTab(targetEntryId, ll) {
    setError('');
    try {
      await api.callInReplacement(targetEntryId, ll.entry, 'lucky_loser');
      await api.clearScheduleForEntry(targetEntryId);
      const [freshEntries, freshLL] = await Promise.all([
        api.getDrawEntries(eventId, 'main'),
        api.getLuckyLosers(eventId),
      ]);
      setEntries(freshEntries);
      setLuckyLosers(freshLL);
    } catch (err) {
      setError(err.message);
    }
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
            <div className="subtitle">
              {event?.ageGroup} · {week?.name}
              {event?.entriesOpen && (
                <span style={{ marginLeft: 10, background: '#1a6b3a', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, verticalAlign: 'middle' }}>
                  Entries Open
                </span>
              )}
            </div>
          </div>

          {/* Action buttons — context-aware */}
          {activeTab !== 'lucky_losers' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {isOwner && viewMode !== 'bracket' && (
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
                {byeCount > 0 && !hasGaps && (
                  <button className="action-btn t-engine-btn" onClick={handleClearByes}>
                    Clear BYEs
                  </button>
                )}
                {mainEntries.length > 0 && !hasGaps && (
                  <button
                    className={'action-btn t-swap-btn' + (swapMode ? ' active' : '')}
                    onClick={toggleSwapMode}
                  >
                    {swapMode ? (selectedEntry ? `Swap: ${selectedEntry.familyName}…` : 'Click to swap') : '⇅ Swap'}
                  </button>
                )}
              </>
            )}
            {/* Generate / Re-generate Bracket */}
            {isOwner && drawFull && (
              <button
                className="action-btn t-gen-btn"
                onClick={handleGenerateBracket}
                disabled={generating}
              >
                {generating ? 'Generating…' : matches.length > 0 ? '↺ Regenerate Bracket' : '▶ Generate Bracket'}
              </button>
            )}
            {/* Promote Qualifiers — visible when qualifying draw is fully decided */}
            {isOwner && qualComplete && (
              <button className="action-btn t-promote-btn" onClick={handlePromoteQualifiers}>
                ✓ Promote Qualifiers → Main
              </button>
            )}
            {/* Open / Close / Freeze entries — organiser only */}
            {isOwner && (
              <>
                <button
                  className="action-btn"
                  style={{ background: event?.entriesOpen ? '#7c3a00' : 'var(--accent,#1a6b3a)', color: '#fff' }}
                  onClick={async () => {
                    try {
                      const updated = await api.updateEvent(eventId, { entriesOpen: !event?.entriesOpen });
                      setEvent(updated);
                    } catch (err) { alert(err.message); }
                  }}
                >
                  {event?.entriesOpen ? 'Close Entries' : 'Open Entries'}
                </button>
                {event?.entriesOpen && (
                  <button
                    className="action-btn"
                    style={{ background: '#4b1fa0', color: '#fff' }}
                    onClick={async () => {
                      if (!window.confirm('Freeze entries? Players will no longer be able to self-enter or withdraw online. This cannot be undone easily.')) return;
                      try {
                        const updated = await api.updateEvent(eventId, { entriesOpen: false, entryCloseDate: new Date().toISOString().slice(0, 10) });
                        setEvent(updated);
                      } catch (err) { alert(err.message); }
                    }}
                  >
                    🔒 Freeze Entries
                  </button>
                )}
              </>
            )}
            {/* PDF draw sheet — always available when entries exist */}
            {mainEntries.length > 0 && (
              <button
                className="action-btn t-pdf-btn"
                onClick={() => generateDrawSheetPDF({
                  event: { ...event, drawType },
                  week,
                  entries: sortedEntries,
                  matches,
                })}
              >
                ⬇ PDF
              </button>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Draw-type tabs — always visible */}
      <div className="t-draw-tabs">
        <button className={'t-draw-tab' + (activeTab === 'main' ? ' active' : '')}
          onClick={() => { setActiveTab('main'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); setMatches([]); }}>
          Main Draw ({event?.drawSize ?? '?'})
        </button>
        {event?.hasQualifying && (
          <button className={'t-draw-tab' + (activeTab === 'qualifying' ? ' active' : '')}
            onClick={() => { setActiveTab('qualifying'); setDrawType('qualifying'); setSwapMode(false); setSelectedEntry(null); setMatches([]); }}>
            Qualifying ({event.qualifyingSize || '—'})
          </button>
        )}
        <button className={'t-draw-tab' + (activeTab === 'alternates' ? ' active' : '')}
          onClick={() => { setActiveTab('alternates'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); }}>
          Alternates{alternateEntries.length > 0 ? ` (${alternateEntries.length})` : ''}
        </button>
        <button className={'t-draw-tab' + (activeTab === 'withdrawal' ? ' active' : '')}
          onClick={() => { setActiveTab('withdrawal'); setSwapMode(false); setSelectedEntry(null); }}>
          Withdrawal{withdrawnEntries.length > 0 ? ` (${withdrawnEntries.length})` : ''}
        </button>
        {event?.hasQualifying && (
          <button className={'t-draw-tab' + (activeTab === 'lucky_losers' ? ' active' : '')}
            onClick={() => { setActiveTab('lucky_losers'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); }}>
            Lucky Losers
          </button>
        )}
      </div>

      {/* View toggle + stats — only for draw tabs */}
      {(activeTab === 'main' || activeTab === 'qualifying') && (
      <div className="t-view-bar">
        <div className="t-view-stats">
          <span>{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          {byeCount > 0 && <span className="t-stat-bye"> · {byeCount} BYE{byeCount !== 1 ? 's' : ''}</span>}
          {hasGaps && <span className="t-stat-gap"> · {maxPos - mainEntries.length} open</span>}
          {event?.status && event.status !== 'setup' && (
            <span className={`t-status-badge t-status-${event.status}`} style={{ marginLeft: 8 }}>
              {event.status.replace('_', ' ')}
            </span>
          )}
        </div>
        <div className="t-view-toggle">
          <button className={'t-vtab' + (viewMode === 'list' ? ' active' : '')}
            onClick={() => setViewMode('list')}>List</button>
          {matches.length === 0 && (
            <button className={'t-vtab' + (viewMode === 'drawsheet' ? ' active' : '')}
              onClick={() => setViewMode('drawsheet')}>Draw Sheet</button>
          )}
          {matches.length > 0 && (
            <button className={'t-vtab' + (viewMode === 'bracket' ? ' active' : '')}
              onClick={() => setViewMode('bracket')}>Bracket</button>
          )}
        </div>
      </div>
      )}

      {/* Progress bar — only for draw tabs */}
      {(activeTab === 'main' || activeTab === 'qualifying') && viewMode !== 'bracket' && (
        <div className="t-entry-progress">
          <div className="t-entry-progress-label">
            <span><strong>{mainEntries.length}</strong> / {maxPos} positions filled</span>
            <span className="t-entry-progress-pct">{fillPct}%</span>
          </div>
          <div className="t-progress-track">
            <div className="t-progress-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      )}

      {error && <div style={{ padding: '6px 16px', color: '#e05252', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>{error}</div>}
      {(activeTab === 'main' || activeTab === 'qualifying') && swapMode && (
        <div className="t-swap-hint">
          {selectedEntry ? `Click another player to swap with ${selectedEntry.familyName}.`
            : 'Click any player to select, then click another to swap positions.'}
          <button className="t-swap-cancel" onClick={toggleSwapMode}>Cancel</button>
        </div>
      )}

      {/* ---- Content ---- */}
      {activeTab === 'lucky_losers' ? (
        <LuckyLosersPanel
          luckyLosers={luckyLosers}
          mainEntries={mainEntries}
          isOwner={isOwner}
          drawing={drawingLL}
          onRandomDraw={handleRandomDrawLuckyLosers}
          onCallIn={handleCallInLuckyLoserFromTab}
        />
      ) : activeTab === 'alternates' ? (
        <div className="page-scroll">
          {alternateEntries.length === 0 ? (
            <div className="history-empty">No alternates yet. Use + Add Player (alternate) or import via Bulk Import → Alternates tab.</div>
          ) : (
            <div className="t-entry-table-wrap">
              <table className="t-entry-table">
                <thead>
                  <tr>
                    <th className="t-th-pos">#</th>
                    <th>Player</th>
                    <th className="t-th-aita">AITA Reg</th>
                    <th className="t-th-state">State</th>
                    <th className="t-th-rank">Rank</th>
                    {isOwner && <th className="t-th-actions"></th>}
                  </tr>
                </thead>
                <tbody>
                  {alternateEntries.map(entry => (
                    <AlternateRow key={entry.id} entry={entry} maxPos={maxPos} isOwner={isOwner} onDelete={handleDeleteEntry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'withdrawal' ? (
        <div className="page-scroll">
          {withdrawnEntries.length === 0 ? (
            <div className="history-empty">No withdrawal list entries. Use Bulk Import → Full List to import the full acceptance list including withdrawals.</div>
          ) : (
            <div className="t-entry-table-wrap">
              <table className="t-entry-table">
                <thead>
                  <tr>
                    <th className="t-th-pos">#</th>
                    <th>Player</th>
                    <th className="t-th-aita">AITA Reg</th>
                    <th className="t-th-state">State</th>
                    <th className="t-th-rank">Rank</th>
                    <th className="t-th-sc">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawnEntries.map((entry, i) => (
                    <tr key={entry.id} className="t-entry-row t-entry-withdrawn">
                      <td className="t-entry-pos">{i + 1}</td>
                      <td className="t-entry-name">
                        <div className="t-entry-name-main">
                          {entry.familyName}
                          {entry.firstName ? <span className="t-entry-first">, {entry.firstName}</span> : null}
                        </div>
                      </td>
                      <td className="t-entry-aita">{entry.aitaReg || <span className="t-entry-dash">—</span>}</td>
                      <td className="t-entry-state">{entry.playerState || <span className="t-entry-dash">—</span>}</td>
                      <td className="t-entry-rank">{entry.ranking || <span className="t-entry-dash">—</span>}</td>
                      <td className="t-entry-sc">
                        <span className="t-sc-badge" style={{ background: '#7c3a00', color: '#ffd9b0' }}>
                          {entry.withdrawalType || 'W'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div className="page-scroll">
        {mainEntries.length === 0 ? (
          <div className="history-empty">
            {isOwner ? 'No players entered yet. Use + Add Player or Bulk Import.' : 'No players entered yet.'}
          </div>

        ) : viewMode === 'bracket' ? (
          matches.length === 0 ? (
            <div className="history-empty">Bracket not generated yet.</div>
          ) : (
            <BracketView
              matches={matches}
              entries={sortedEntries}
              drawSize={maxPos}
              totalRounds={totalRounds}
              isOwner={isOwner}
              onScore={match => setScoringMatch(match)}
            />
          )

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
          <>
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
                      onWithdraw={e => setWithdrawingEntry(e)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alternates — only meaningful for the main draw */}
            {activeTab === 'main' && !swapMode && (
              <div style={{ marginTop: 18 }}>
                <div className="t-section-label" style={{ padding: '0 16px' }}>
                  Alternates{alternateEntries.length > 0 ? ` (${alternateEntries.length})` : ''}
                </div>
                {alternateEntries.length === 0 ? (
                  <div className="history-empty" style={{ padding: '8px 16px' }}>
                    None yet — check "Alternate / replacement entry" in + Add Player.
                  </div>
                ) : (
                  <div className="t-entry-table-wrap">
                    <table className="t-entry-table">
                      <thead>
                        <tr>
                          <th className="t-th-pos">#</th>
                          <th>Player</th>
                          <th className="t-th-aita">AITA Reg</th>
                          <th className="t-th-state">State</th>
                          <th className="t-th-rank">Rank</th>
                          {isOwner && <th className="t-th-actions"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {alternateEntries.map(entry => (
                          <AlternateRow
                            key={entry.id}
                            entry={entry}
                            maxPos={maxPos}
                            isOwner={isOwner}
                            onDelete={handleDeleteEntry}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* ---- Modals ---- */}
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
          onWithdraw={handleBulkWithdraw}
          onClose={() => setShowBulk(false)}
        />
      )}
      {scoringMatch && (() => {
        const entryMap = new Map(entries.map(e => [e.id, e]));
        return (
          <ScoreModal
            match={scoringMatch}
            entry1={entryMap.get(scoringMatch.entry1Id)}
            entry2={entryMap.get(scoringMatch.entry2Id)}
            onSave={handleScoreMatch}
            onClose={() => setScoringMatch(null)}
          />
        );
      })()}
      {withdrawingEntry && (
        <WithdrawModal
          entry={withdrawingEntry}
          event={event}
          drawType={drawType}
          matches={matches}
          alternateEntries={alternateEntries}
          luckyLosers={luckyLosers}
          onNoReplacement={handleWithdrawNoReplacement}
          onCallInAlternate={handleCallInAlternate}
          onCallInLuckyLoser={handleCallInLuckyLoser}
          onClose={() => setWithdrawingEntry(null)}
        />
      )}
    </div>
  );
}
