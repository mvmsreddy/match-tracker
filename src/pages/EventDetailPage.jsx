import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { applySeeding, randomizeDraw, buildByeEntries, buildR1Matches, swapPositions } from '../utils/drawEngine';
import { generateDrawSheetPDF } from '../utils/drawPdf';
import { checkAgeEligibility, minEligibleAgeGroup } from '../utils/eligibility';
import { DOUBLES_MIN_PAIRS_FOR_POINTS, ANNUAL_TOURNAMENT_LIMITS, bracketSize } from '../utils/aitaGradeRules';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Table, TableHeader, TableBody, TableRow as UITableRow, TableHead, TableCell } from '@/components/primitives/table';
import { cn } from '../lib/utils';
import { toDisplayRating } from '../lib/glicko2';

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9 w-full';

const STATUS_STYLES = {
  setup: 'bg-muted text-muted-foreground',
  draw_ready: 'bg-primary/10 text-accent-ink',
  in_progress: 'bg-chart-2/15 text-chart-2',
  complete: 'bg-chart-3/15 text-chart-3',
};

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_CODES = ['', 'WC', 'LL', 'Q', 'SE', 'PR', 'ITF'];
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
      <div className="text-sm text-muted-foreground mb-3">
        <strong className="text-foreground">Two formats:</strong>{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode</code> (auto-position)
        {' '}or{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">Pos, FamilyName, ...</code> (explicit position).
        Tab-separated (Excel/Sheets) also works.
        {!isAlternate && <>{' '}<strong className="text-foreground">{remaining > 0 ? remaining : 0}</strong> slot{remaining !== 1 ? 's' : ''} available.</>}
      </div>

      {!preview && (
        <>
          <textarea
            className="w-full min-h-[220px] rounded-sm border border-input bg-transparent px-3 py-2 font-mono text-xs resize-y leading-relaxed"
            rows={11}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          {parseErrors.length > 0 && (
            <div className="text-sm text-destructive mt-2 space-y-0.5">
              {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </>
      )}

      {preview && (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">{preview.length} player{preview.length !== 1 ? 's' : ''} to import{isAlternate ? ' as Alternates' : ''}</div>
          <div className="rounded-sm border border-border overflow-x-auto max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <UITableRow><TableHead>Pos</TableHead><TableHead>Seed</TableHead><TableHead>Name</TableHead><TableHead>AITA Reg</TableHead><TableHead>State</TableHead><TableHead>Rank</TableHead><TableHead>SC</TableHead></UITableRow>
              </TableHeader>
              <TableBody>
                {preview.map((e, i) => (
                  <UITableRow key={i}>
                    <TableCell>{isAlternate ? `Alt ${e.position - (startPos - 1)}` : e.position}</TableCell>
                    <TableCell>{e.seed || '—'}</TableCell>
                    <TableCell>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</TableCell>
                    <TableCell>{e.aitaReg || '—'}</TableCell>
                    <TableCell>{e.playerState || '—'}</TableCell>
                    <TableCell>{e.ranking || '—'}</TableCell>
                    <TableCell>{e.statusCode ? <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{e.statusCode}</span> : '—'}</TableCell>
                  </UITableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {saveError && <div className="text-sm text-destructive mt-2">{saveError}</div>}

      <div className="flex gap-2 mt-4">
        {!preview && (
          <Button onClick={handlePreview} disabled={!text.trim()}>Preview</Button>
        )}
        {preview && (
          <>
            <Button disabled={saving || preview.length === 0} onClick={handleImport}>
              {saving ? 'Importing…' : `Import ${preview.length} Player${preview.length !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={() => { setPreview(null); setSaveError(''); }}>Back</Button>
          </>
        )}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
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

  if (loadError) return <div className="text-sm text-destructive mt-2">{loadError}</div>;
  if (!allEntries) return <div className="text-sm text-muted-foreground">Loading entries…</div>;
  if (allEntries.length === 0) return <div className="text-sm text-muted-foreground">No active entries to withdraw.</div>;

  const mainEntries = allEntries.filter(e => e.drawType === 'main' && !e.isAlternate);
  const qualEntries = allEntries.filter(e => e.drawType === 'qualifying' && !e.isAlternate);
  const altEntries  = allEntries.filter(e => e.isAlternate);

  const renderGroup = (label, group) => group.length === 0 ? null : (
    <>
      <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mt-2.5 mb-1">{label}</div>
      {group.map(e => (
        <label key={e.id} className="flex items-center gap-2.5 py-1.5 border-b border-border cursor-pointer text-sm">
          <input type="checkbox" className="accent-primary shrink-0" checked={selected.has(e.id)} onChange={() => toggleEntry(e.id)} />
          <span className="min-w-8 text-muted-foreground font-mono text-[0.68rem]">
            {e.isAlternate ? `A${e.position - (e.drawType === 'main' ? (allEntries.find(x => x.drawType === 'main' && !x.isAlternate) ? 0 : 0) : 0)}` : `#${e.position}`}
          </span>
          {e.seed && <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">[{e.seed}]</span>}
          <span className="flex-1">{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</span>
          <span className="text-muted-foreground text-[0.68rem]">{e.aitaReg || ''}</span>
          <span className="text-muted-foreground text-[0.68rem]">{e.playerState || ''}</span>
          {e.statusCode && <span className="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold">{e.statusCode}</span>}
        </label>
      ))}
    </>
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-2.5 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="checkbox" className="accent-primary"
            checked={selected.size === allEntries.length && allEntries.length > 0}
            onChange={toggleAll}
          />
          Select all ({allEntries.length})
        </label>
        <div className="ml-auto flex items-center gap-2">
          <select className={selectCls} value={wdType} onChange={e => setWdType(e.target.value)}>
            {WD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Input type="date" value={wdDate} onChange={e => setWdDate(e.target.value)} className="w-auto" />
          {(wdType === 'NS' || wdType === 'LW') && (
            <span className="text-[0.68rem] text-muted-foreground" title="AITA rules: No-Show deducts ranking points by grade; a 3rd+ Late Withdrawal in a calendar year (SS/NS/Nationals only) deducts 15. See the Audit Log tab for the computed amount.">
              ranking-point penalty may apply
            </span>
          )}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto border border-border rounded-sm px-2.5">
        {renderGroup('Main Draw', mainEntries)}
        {renderGroup('Qualifying', qualEntries)}
        {renderGroup('Alternates', altEntries)}
      </div>

      {saveError && <div className="text-sm text-destructive mt-2">{saveError}</div>}

      <div className="flex gap-2 mt-4 items-center">
        <Button
          className={cn(selected.size > 0 && 'bg-chart-2 text-white hover:bg-chart-2/90')}
          disabled={saving || selected.size === 0}
          onClick={handleApply}
        >
          {saving ? 'Applying…' : `Apply Withdrawal to ${selected.size} Player${selected.size !== 1 ? 's' : ''}`}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
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
      <div className="mb-3">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">{label} — {arr.length} player{arr.length !== 1 ? 's' : ''}</div>
        <div className="rounded-sm border border-border overflow-x-auto">
          <Table>
            <TableHeader><UITableRow><TableHead>Pos</TableHead><TableHead>Name</TableHead><TableHead>State</TableHead><TableHead>AITA Reg</TableHead><TableHead>Rank</TableHead><TableHead>Seed</TableHead></UITableRow></TableHeader>
            <TableBody>
              {arr.map((e, i) => (
                <UITableRow key={i}>
                  <TableCell>{e.position}</TableCell>
                  <TableCell>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</TableCell>
                  <TableCell>{e.playerState || '—'}</TableCell>
                  <TableCell>{e.aitaReg || '—'}</TableCell>
                  <TableCell>{e.ranking || '—'}</TableCell>
                  <TableCell>{e.seed || '—'}</TableCell>
                </UITableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="text-sm text-muted-foreground mb-3">
        Paste the full AITA acceptance list in one go. Rows are auto-routed by the{' '}
        <strong className="text-foreground">StatusCode</strong> column:{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">MAIN DRAW</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">QUALIFYING DRAW</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">ALTERNATES</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded-sm">WITHDRAWAL LIST</code>.
        {' '}Comma or tab-separated. Header row and <em>State ↔ AitaReg</em> column order are auto-detected.
        All four sections are imported — withdrawal list entries appear in the <strong className="text-foreground">Withdrawal</strong> tab.
      </div>

      {!preview && (
        <>
          <textarea
            className="w-full min-h-[220px] rounded-sm border border-input bg-transparent px-3 py-2 font-mono text-xs resize-y leading-relaxed"
            rows={11}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Pos,FamilyName,FirstName,State,AitaReg,Ranking,Seed,StatusCode\n1,Sharma,Ananya,Maharashtra,440372,10,,MAIN DRAW\n...\n1,Reddy,Kavya,Telangana,444849,56,,QUALIFYING DRAW\n...\n1,Kumari,Divya,Karnataka,446519,702,,ALTERNATES\n...\n1,Pandey,Sidhhi,Uttar Pradesh,441965,3,,WITHDRAWAL LIST'}
            autoFocus
          />
          {parseErrors.length > 0 && (
            <div className="text-sm text-destructive mt-2 space-y-0.5">
              {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="max-h-[340px] overflow-y-auto">
          <SectionTable label="Main Draw"  arr={preview.main} />
          <SectionTable label="Qualifying" arr={preview.qualifying} />
          <SectionTable label="Alternates" arr={preview.alternates} />
          {preview.withdrawal.length > 0 && (
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1">Withdrawal List — {preview.withdrawal.length} player{preview.withdrawal.length !== 1 ? 's' : ''}</div>
              <div className="rounded-sm border border-border overflow-x-auto">
                <Table>
                  <TableHeader><UITableRow><TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>State</TableHead><TableHead>AITA Reg</TableHead><TableHead>Rank</TableHead></UITableRow></TableHeader>
                  <TableBody>
                    {preview.withdrawal.map((e, i) => (
                      <UITableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{e.familyName}{e.firstName ? ', ' + e.firstName : ''}</TableCell>
                        <TableCell>{e.playerState || '—'}</TableCell>
                        <TableCell>{e.aitaReg || '—'}</TableCell>
                        <TableCell>{e.ranking || '—'}</TableCell>
                      </UITableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      {saveError && <div className="text-sm text-destructive mt-2">{saveError}</div>}

      <div className="flex gap-2 mt-4">
        {!preview && (
          <Button onClick={handlePreview} disabled={!text.trim()}>Preview</Button>
        )}
        {preview && (
          <>
            <Button disabled={saving || totalToImport === 0} onClick={handleImport}>
              {saving ? 'Importing…' : `Import ${totalToImport} Player${totalToImport !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={() => { setPreview(null); setSaveError(''); }}>Back</Button>
          </>
        )}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </>
  );
}

function BulkImportModal({ event, drawType, existingEntries, onImport, onWithdraw, onClose }) {
  // Always open on Full List tab — user can switch to per-section tabs if needed
  const [activeTab, setActiveTab] = useState('full');
  const [saving, setSaving] = useState(false);

  // Per-tab derived values
  const mainMax  = bracketSize(event.drawSize || 32);
  const qualMax  = bracketSize(event.qualifyingSize || 32);
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <span className="text-lg font-display font-extrabold tracking-tight">Bulk Import / Withdrawal</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
        </div>

        {/* Tab bar */}
        <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card mb-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === t.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
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
  const maxPos = bracketSize(drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32));

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
        isOnsiteSignin: editingEntry.isOnsiteSignin || false,
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
      isAlternate: false, isOnsiteSignin: false, replacingName: '',
      partnerFamilyName: '', partnerFirstName: '', partnerAitaReg: '', partnerState: '', partnerRanking: '',
      playerId: null,
    };
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitWarning, setLimitWarning] = useState('');

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

  async function handleSave(e, opts = {}) {
    e?.preventDefault?.();
    setError('');
    if (!opts.skipLimitCheck) setLimitWarning('');

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

    // Annual AITA tournament-limit advisory (§ ANNUAL_TOURNAMENT_LIMITS) —
    // U12/U14/U16 caps combine every age group the player is entered in, so
    // this is a cross-tournament count, not scoped to this event. Advisory
    // only (not blocking): it can't fully replicate the PDF's edge cases
    // (e.g. singles+doubles at one tournament = 1, two age groups at one
    // venue = 2), so a false positive shouldn't stop a legitimate entry.
    if (form.aitaReg && form.dateOfBirth && week?.startDate && !opts.skipLimitCheck) {
      try {
        const year = new Date(week.startDate).getFullYear();
        const nativeGroup = minEligibleAgeGroup(form.dateOfBirth, year);
        const limit = ANNUAL_TOURNAMENT_LIMITS[nativeGroup];
        if (limit) {
          const priorEntries = await api.getDrawEntriesForPlayers([form.aitaReg]);
          const counted = new Set();
          for (const en of priorEntries) {
            const w = en.event?.week;
            if (!w?.startDate || !en.event?.ageGroup) continue;
            if (new Date(w.startDate).getFullYear() !== year) continue;
            if ((w.grade || '').toUpperCase().startsWith('ITF')) continue;
            counted.add(`${w.id}|${en.event.ageGroup}`);
          }
          if (counted.size >= limit) {
            // Block once so the warning is actually visible — "Add Anyway"
            // resubmits with skipLimitCheck to proceed past it.
            setLimitWarning(
              `${form.familyName} already has ${counted.size} AITA tournament(s) counted for ${year} — ` +
              `the ${nativeGroup} annual cap is ${limit}. Advisory only (may not account for every edge case).`
            );
            return;
          }
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <span className="text-lg font-display font-extrabold tracking-tight">{editingEntry ? 'Edit Entry' : 'Add Player'}</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Position / Seed / Status */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Draw Position">
              <Input
                type="number" min="1" max={maxPos}
                value={form.position}
                disabled={form.isAlternate}
                onChange={e => set('position', e.target.value)}
              />
              {form.isAlternate && (
                <div className="text-[0.68rem] text-muted-foreground">Alternate #{form.position - maxPos}</div>
              )}
            </Field>
            <Field label="Seed">
              <Input
                type="number" min="1" max={event.numSeeds}
                value={form.seed}
                onChange={e => set('seed', e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Status Code">
              <select className={selectCls} value={form.statusCode} onChange={e => set('statusCode', e.target.value)}>
                {STATUS_CODES.map(c => (
                  <option key={c} value={c}>{c || '— None —'}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Platform player search */}
          <Field label="Search Platform Player (optional)">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Type name or AITA reg to auto-fill…"
            />
            {searching && <div className="text-xs text-muted-foreground">Searching…</div>}
            {searchResults.length > 0 && (
              <div className="border border-border rounded-sm divide-y divide-border max-h-48 overflow-y-auto">
                {searchResults.map((p, i) => (
                  <button
                    key={p.id || p.aitaReg || i}
                    type="button"
                    className="w-full text-left px-3 py-2 bg-transparent hover:bg-secondary flex flex-col gap-0.5"
                    onClick={() => fillFromPlayer(p)}
                  >
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      {p.familyName ? `${p.familyName}${p.firstName ? ', ' + p.firstName : ''}` : p.displayName}
                      {p._source === 'aita' && <span className="inline-flex items-center rounded-sm bg-primary/10 text-accent-ink px-1.5 py-0.5 text-[0.6rem] font-bold">AITA</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[p.aitaReg, p.stateAbbr || p.state, p.ranking && `Rank ${p.ranking}`, p.ageGroup].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Player details */}
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground pt-1">Player Details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Family Name *">
              <Input
                value={form.familyName}
                onChange={e => set('familyName', e.target.value)}
                placeholder="Last name"
                autoFocus={!editingEntry}
              />
            </Field>
            <Field label="First Name">
              <Input
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="First name"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="AITA Reg #">
              <Input
                value={form.aitaReg}
                onChange={e => set('aitaReg', e.target.value)}
                placeholder="e.g. MHAP12345"
              />
            </Field>
            <Field label="State">
              <select className={selectCls} value={form.playerState} onChange={e => set('playerState', e.target.value)}>
                <option value="">— State —</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Ranking">
              <Input
                type="number" min="1"
                value={form.ranking}
                onChange={e => set('ranking', e.target.value)}
                placeholder="AITA rank"
              />
            </Field>
            <Field label="Date of Birth">
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={e => set('dateOfBirth', e.target.value)}
              />
            </Field>
          </div>

          {/* Doubles partner */}
          {event.isDoubles && (
            <>
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground pt-2">Partner Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Partner Family Name *">
                  <Input
                    value={form.partnerFamilyName}
                    onChange={e => set('partnerFamilyName', e.target.value)}
                    placeholder="Partner last name"
                  />
                </Field>
                <Field label="Partner First Name">
                  <Input
                    value={form.partnerFirstName}
                    onChange={e => set('partnerFirstName', e.target.value)}
                    placeholder="Partner first name"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Partner AITA Reg #">
                  <Input
                    value={form.partnerAitaReg}
                    onChange={e => set('partnerAitaReg', e.target.value)}
                    placeholder="e.g. MHAP67890"
                  />
                </Field>
                <Field label="Partner State">
                  <select className={selectCls} value={form.partnerState} onChange={e => set('partnerState', e.target.value)}>
                    <option value="">— State —</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Partner Ranking">
                  <Input
                    type="number" min="1"
                    value={form.partnerRanking}
                    onChange={e => set('partnerRanking', e.target.value)}
                    placeholder="Rank"
                  />
                </Field>
              </div>
            </>
          )}

          {/* Alternate */}
          <div className="pt-1 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={form.isAlternate}
                onChange={e => set('isAlternate', e.target.checked)}
              />
              Alternate / replacement entry
            </label>
            {form.isAlternate && (
              <Input
                value={form.replacingName}
                onChange={e => set('replacingName', e.target.value)}
                placeholder="Replacing (player name)"
              />
            )}
            {form.isAlternate && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={form.isOnsiteSignin}
                  onChange={e => set('isOnsiteSignin', e.target.checked)}
                />
                Onsite / walk-in sign-in (no prior ranked registration — called in only after ranked alternates are exhausted)
              </label>
            )}
          </div>

          {limitWarning && (
            <div className="text-xs text-chart-2 font-semibold">{limitWarning}</div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex gap-2 pt-2">
            {limitWarning ? (
              <Button type="button" disabled={saving}
                onClick={() => handleSave(null, { skipLimitCheck: true })}>
                {saving ? 'Saving…' : 'Add Anyway'}
              </Button>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Add Player'}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntryRow  (players list view)
// ---------------------------------------------------------------------------
function Dash() { return <span className="text-muted-foreground">—</span>; }

const scBadgeCls = 'inline-flex items-center rounded-sm bg-secondary text-secondary-foreground px-2 py-0.5 text-[0.68rem] font-semibold';
const moveSelectCls = 'text-[0.68rem] rounded-sm border border-input bg-transparent px-1 py-1';
const iconBtnCls = 'w-7 h-7 shrink-0 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary text-muted-foreground';
const paidBadgeCls = 'inline-flex items-center rounded-sm bg-primary/15 text-accent-ink px-2 py-0.5 text-[0.62rem] font-bold';
const unpaidBadgeCls = 'inline-flex items-center rounded-sm bg-destructive/15 text-destructive px-2 py-0.5 text-[0.62rem] font-bold';

// Phase 47 — entry-fee payment status. entry.paymentId means paid online via
// Razorpay (unchanged, not revertible here). entry.paymentStatus covers the
// offline path: 'pending' = self-entered a paid event without paying yet,
// 'paid' = organiser confirmed cash/UPI at venue.
function PaymentBadge({ entry, isOwner, onTogglePayment }) {
  if (entry.paymentId) {
    return <span className={cn(paidBadgeCls, 'mt-0.5')} title="Entry fee paid via Razorpay">PAID</span>;
  }
  if (entry.paymentStatus === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 mt-0.5">
        <span className={paidBadgeCls} title="Entry fee paid offline (organiser-confirmed)">PAID (offline)</span>
        {isOwner && onTogglePayment && (
          <button type="button" className="text-[0.62rem] text-muted-foreground underline decoration-dotted hover:text-foreground"
            onClick={e => { e.stopPropagation(); onTogglePayment(entry.id, 'pending'); }} title="Revert to unpaid">
            undo
          </button>
        )}
      </span>
    );
  }
  if (entry.paymentStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 mt-0.5">
        <span className={unpaidBadgeCls} title="Entered — entry fee not yet paid">UNPAID</span>
        {isOwner && onTogglePayment && (
          <button type="button" className="text-[0.62rem] font-bold text-accent-ink underline decoration-dotted hover:no-underline"
            onClick={e => { e.stopPropagation(); onTogglePayment(entry.id, 'paid'); }} title="Mark this player's entry fee as received">
            Mark Paid
          </button>
        )}
      </span>
    );
  }
  return null;
}

function EntryRow({ entry, isDoubles, isOwner, swapMode, selected, onSelect, onEdit, onDelete, onWithdraw, onMove, onTogglePayment, currentGroup, trackerRating }) {
  const isBye = entry.isBye;
  const isWithdrawn = entry.isWithdrawn;
  return (
    <UITableRow
      className={cn(
        (isBye || isWithdrawn) && 'opacity-60',
        selected && 'bg-primary/10',
        swapMode && !isBye && 'cursor-pointer hover:bg-secondary'
      )}
      onClick={swapMode && !isBye ? () => onSelect(entry) : undefined}
    >
      <TableCell className="font-mono">{entry.position}</TableCell>
      <TableCell>
        {entry.seed ? <span className={scBadgeCls}>[{entry.seed}]</span> : <Dash />}
      </TableCell>
      <TableCell>
        {isBye ? (
          <span className="text-muted-foreground italic uppercase text-xs">BYE</span>
        ) : (
          <>
            <div className="font-semibold text-sm">
              {entry.familyName}
              {entry.firstName ? <span className="font-normal">, {entry.firstName}</span> : null}
              {isWithdrawn && <span className="text-destructive font-bold text-xs"> WD</span>}
            </div>
            {isDoubles && entry.partnerFamilyName && (
              <div className="text-xs text-muted-foreground">
                + {entry.partnerFamilyName}
                {entry.partnerFirstName ? `, ${entry.partnerFirstName}` : ''}
              </div>
            )}
            {entry.isAlternate && (
              <span className="inline-flex items-center rounded-sm bg-chart-2/15 text-chart-2 px-2 py-0.5 text-[0.62rem] font-bold mt-0.5">ALT{entry.replacingName ? ` → ${entry.replacingName}` : ''}</span>
            )}
            <PaymentBadge entry={entry} isOwner={isOwner} onTogglePayment={onTogglePayment} />
          </>
        )}
      </TableCell>
      <TableCell>{entry.aitaReg || <Dash />}</TableCell>
      <TableCell>{entry.playerState || <Dash />}</TableCell>
      <TableCell>
        {entry.ranking || <Dash />}
        {trackerRating && (
          <div className="text-[0.62rem] text-muted-foreground font-semibold mt-0.5" title={`Computed Tracker Rating from ${trackerRating.matchesCount} rated match${trackerRating.matchesCount === 1 ? '' : 'es'}`}>
            ★ {toDisplayRating(trackerRating.rating).toFixed(1)}
          </div>
        )}
      </TableCell>
      <TableCell>
        {entry.statusCode ? <span className={scBadgeCls}>{entry.statusCode}</span> : <Dash />}
      </TableCell>
      {isOwner && !swapMode && (
        <TableCell>
          <div className="flex items-center gap-1">
            {!isBye && <button className={iconBtnCls} onClick={() => onEdit(entry)} title="Edit">✎</button>}
            {!isBye && !isWithdrawn && (
              <button className={cn(iconBtnCls, 'hover:text-chart-2')} onClick={() => onWithdraw(entry)} title="Withdraw">↯</button>
            )}
            {!isBye && onMove && (
              <select
                className={moveSelectCls}
                value=""
                title="Move to group"
                onChange={e => { if (e.target.value) onMove(entry.id, e.target.value); }}
              >
                <option value="">Move→</option>
                {currentGroup !== 'main'       && <option value="main">Main Draw</option>}
                {currentGroup !== 'qualifying' && <option value="qualifying">Qualifying</option>}
                {currentGroup !== 'alternates' && <option value="alternates">Alternates</option>}
                {currentGroup !== 'withdrawal' && <option value="withdrawal">Withdrawal</option>}
              </select>
            )}
            <button className={cn(iconBtnCls, 'hover:text-destructive')} onClick={() => onDelete(entry.id)} title="Remove">✕</button>
          </div>
        </TableCell>
      )}
    </UITableRow>
  );
}

// ---------------------------------------------------------------------------
// AlternateRow  (alternates list — positions beyond the draw size)
// ---------------------------------------------------------------------------
function AlternateRow({ entry, maxPos, isOwner, onDelete, onMove, onTogglePayment }) {
  return (
    <UITableRow>
      <TableCell className="font-mono">#{entry.position - maxPos}</TableCell>
      <TableCell>
        <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
          {entry.familyName}
          {entry.firstName ? <span className="font-normal">, {entry.firstName}</span> : null}
          {entry.isOnsiteSignin && (
            <span className={scBadgeCls} title="Onsite/walk-in sign-in — no prior ranked registration">
              ONSITE
            </span>
          )}
          <PaymentBadge entry={entry} isOwner={isOwner} onTogglePayment={onTogglePayment} />
        </div>
      </TableCell>
      <TableCell>{entry.aitaReg || <Dash />}</TableCell>
      <TableCell>{entry.playerState || <Dash />}</TableCell>
      <TableCell>{entry.ranking || <Dash />}</TableCell>
      {isOwner && (
        <TableCell>
          <div className="flex items-center gap-1">
            {onMove && (
              <select
                className={moveSelectCls}
                value=""
                title="Move to group"
                onChange={e => { if (e.target.value) onMove(entry.id, e.target.value); }}
              >
                <option value="">Move→</option>
                <option value="main">Main Draw</option>
                <option value="qualifying">Qualifying</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            )}
            <button className={cn(iconBtnCls, 'hover:text-destructive')} onClick={() => onDelete(entry.id)} title="Remove">✕</button>
          </div>
        </TableCell>
      )}
    </UITableRow>
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <span className="text-lg font-display font-extrabold tracking-tight">
            Withdraw {entry.familyName}{entry.firstName ? `, ${entry.firstName}` : ''}
          </span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
        </div>

        {hasPlayed && (
          <div className="rounded-sm bg-chart-2/10 border border-chart-2/30 text-chart-2 text-sm px-3 py-2 mb-3">
            This player has already completed a match — an alternate cannot fill this spot.
          </div>
        )}

        {showAlternates && (
          <div className="mb-3">
            <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1.5">Call In an Alternate</div>
            {alternateEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No alternates entered for this draw.</div>
            ) : (
              <div className="space-y-1.5">
                {alternateEntries.map(alt => (
                  <div key={alt.id} className="flex items-center justify-between gap-3 p-2.5 rounded-sm border border-border bg-card">
                    <span className="text-sm flex items-center gap-1.5">
                      {alt.familyName}{alt.firstName ? `, ${alt.firstName}` : ''}
                      {alt.ranking ? ` (rank ${alt.ranking})` : ''}
                      {alt.isOnsiteSignin && <span className={scBadgeCls}>ONSITE</span>}
                    </span>
                    <Button size="sm" disabled={saving} onClick={() => run(() => onCallInAlternate(alt))}>Call In</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showLuckyLosers && (
          <div className="mb-3">
            <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-1.5">Call In a Lucky Loser</div>
            {waitingLuckyLosers.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No lucky losers available. Run Random Draw on the Lucky Losers tab once qualifying is decided.
              </div>
            ) : (
              <div className="space-y-1.5">
                {waitingLuckyLosers.map(ll => (
                  <div key={ll.id} className="flex items-center justify-between gap-3 p-2.5 rounded-sm border border-border bg-card">
                    <span className="text-sm">#{ll.priority} — {ll.entry?.familyName}{ll.entry?.firstName ? `, ${ll.entry.firstName}` : ''}</span>
                    <Button size="sm" disabled={saving} onClick={() => run(() => onCallInLuckyLoser(ll))}>Call In</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-destructive mb-2">{error}</div>}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" disabled={saving} onClick={() => run(onNoReplacement)}>
            {hasPlayed ? 'Grant Walkover to Opponent' : 'Withdraw — No Replacement'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
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
    <div className="space-y-3">
      {isOwner && (
        <Button onClick={onRandomDraw} disabled={drawing}>
          {drawing ? 'Drawing…' : hasAny ? '↺ Re-Draw' : '🎲 Random Draw'}
        </Button>
      )}
      {luckyLosers.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No lucky losers drawn yet. Run Random Draw once the qualifying deciding round is complete.
        </div>
      ) : (
        <div className="rounded-sm border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <UITableRow>
                <TableHead>#</TableHead><TableHead>Player</TableHead><TableHead>AITA Reg</TableHead><TableHead>Status</TableHead>
                {isOwner && <TableHead />}
              </UITableRow>
            </TableHeader>
            <TableBody>
              {luckyLosers.map(ll => (
                <UITableRow key={ll.id}>
                  <TableCell>{ll.priority}</TableCell>
                  <TableCell>{ll.entry?.familyName}{ll.entry?.firstName ? `, ${ll.entry.firstName}` : ''}</TableCell>
                  <TableCell>{ll.entry?.aitaReg || <Dash />}</TableCell>
                  <TableCell>
                    {ll.status === 'called_in'
                      ? <span className="inline-flex items-center rounded-sm bg-chart-3/15 text-chart-3 px-2 py-0.5 text-[0.68rem] font-semibold">Called In</span>
                      : <span className="inline-flex items-center rounded-sm bg-chart-2/15 text-chart-2 px-2 py-0.5 text-[0.68rem] font-semibold">Waiting</span>}
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      {ll.status === 'waiting' && (
                        unresolvedWithdrawn.length === 0 ? (
                          <span className="text-muted-foreground">No open slot</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              className={selectCls}
                              value={pickedTarget[ll.id] || ''}
                              onChange={e => setPickedTarget(prev => ({ ...prev, [ll.id]: e.target.value }))}
                            >
                              <option value="">Fill which slot?</option>
                              {unresolvedWithdrawn.map(e => (
                                <option key={e.id} value={e.id}>Pos {e.position} — {e.familyName}</option>
                              ))}
                            </select>
                            <Button size="sm" disabled={!pickedTarget[ll.id]} onClick={() => onCallIn(pickedTarget[ll.id], ll)}>Call In</Button>
                          </div>
                        )
                      )}
                    </TableCell>
                  )}
                </UITableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntriesSummaryTable — consolidated, ranking-sorted view merging main draw,
// qualifying, alternates, withdrawals and the lucky-loser pool, so the
// organiser can see everyone's draw status and payment status in one place
// instead of checking each tab separately.
// ---------------------------------------------------------------------------
const STAGE_BADGE_STYLES = {
  'Main Draw': 'bg-chart-3/15 text-chart-3',
  'Qualifying': 'bg-primary/10 text-accent-ink',
  'Alternate': 'bg-secondary text-secondary-foreground',
  'Withdrawn': 'bg-destructive/15 text-destructive',
  'Lucky Loser': 'bg-chart-2/15 text-chart-2',
};

function StageBadge({ stage }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-semibold', STAGE_BADGE_STYLES[stage] || 'bg-muted text-muted-foreground')}>
      {stage}
    </span>
  );
}

// Merges the four independently-fetched entry lists into one array of
// { entry, sourceGroup, stage } rows, sorted by ranking (unranked last) — the
// same convention already used for the alternates waitlist sort.
function buildEntriesSummary({ allMainEntries, allQualEntries, withdrawnEntries, luckyLosers, event }) {
  const mainMax = bracketSize(event?.drawSize || 32);
  const qualMax = bracketSize(event?.qualifyingSize || 32);

  function stageFor(entry, maxPos, drawLabel) {
    if (entry.isWithdrawn) return 'Withdrawn';
    if (entry.position > maxPos) return 'Alternate';
    return drawLabel;
  }

  const rows = [];
  for (const entry of allMainEntries) {
    if (entry.isBye) continue;
    rows.push({ entry, sourceGroup: 'main', stage: stageFor(entry, mainMax, 'Main Draw') });
  }
  for (const entry of allQualEntries) {
    if (entry.isBye) continue;
    rows.push({ entry, sourceGroup: 'qualifying', stage: stageFor(entry, qualMax, 'Qualifying') });
  }
  for (const entry of withdrawnEntries) {
    rows.push({ entry, sourceGroup: 'withdrawal', stage: 'Withdrawn' });
  }
  // Lucky losers already promoted into the main draw (status 'called_in')
  // are reflected there instead — showing them here too would double-count.
  for (const ll of luckyLosers) {
    if (ll.status === 'called_in' || !ll.entry) continue;
    rows.push({ entry: ll.entry, sourceGroup: 'lucky_loser', stage: 'Lucky Loser' });
  }

  return rows.sort((a, b) => (a.entry.ranking ?? Infinity) - (b.entry.ranking ?? Infinity));
}

function EntriesSummaryTable({ isDoubles, isOwner, rows, onTogglePayment }) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
        No players entered yet.
      </div>
    );
  }
  return (
    <div className="rounded-sm border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <UITableRow>
            <TableHead>{isDoubles ? 'Team' : 'Player'}</TableHead>
            <TableHead>AITA Reg</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Rank</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
          </UITableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ entry, sourceGroup, stage }) => (
            <UITableRow key={`${sourceGroup}-${entry.id}`} className={stage === 'Withdrawn' ? 'opacity-60' : undefined}>
              <TableCell>
                <div className="font-semibold text-sm">
                  {entry.familyName}
                  {entry.firstName ? <span className="font-normal">, {entry.firstName}</span> : null}
                </div>
                {isDoubles && entry.partnerFamilyName && (
                  <div className="text-xs text-muted-foreground">
                    + {entry.partnerFamilyName}{entry.partnerFirstName ? `, ${entry.partnerFirstName}` : ''}
                  </div>
                )}
              </TableCell>
              <TableCell>{entry.aitaReg || <Dash />}</TableCell>
              <TableCell>{entry.playerState || <Dash />}</TableCell>
              <TableCell>{entry.ranking || <Dash />}</TableCell>
              <TableCell><StageBadge stage={stage} /></TableCell>
              <TableCell>
                <PaymentBadge
                  entry={entry}
                  isOwner={isOwner}
                  onTogglePayment={onTogglePayment ? (entryId, status) => onTogglePayment(entryId, status, sourceGroup) : undefined}
                />
              </TableCell>
            </UITableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditLogPanel  (Phase 18 — organiser-only withdrawal audit trail)
// ---------------------------------------------------------------------------
function AuditLogPanel({ eventId }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getWithdrawalAuditLog(eventId)
      .then(list => { if (!cancelled) setRows(list); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (loadError) return <div className="text-sm text-destructive">{loadError}</div>;
  if (rows === null) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No withdrawals logged yet.</div>
      ) : (
        <div className="rounded-sm border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <UITableRow>
                <TableHead>Player</TableHead>
                <TableHead>Draw</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Initiated By</TableHead>
                <TableHead>Penalty</TableHead>
                <TableHead>Replacement</TableHead>
              </UITableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <UITableRow key={row.id}>
                  <TableCell className="font-semibold">{row.playerName}{row.aitaReg ? ` (${row.aitaReg})` : ''}</TableCell>
                  <TableCell>{row.drawType === 'qualifying' ? 'Qualifying' : 'Main'}</TableCell>
                  <TableCell>{row.withdrawalType}</TableCell>
                  <TableCell>{row.withdrawalDate}</TableCell>
                  <TableCell>{row.initiatedBy === 'self' ? 'Self' : 'Referee'}</TableCell>
                  <TableCell>
                    {row.penaltyPoints
                      ? <span className="text-chart-2 font-semibold" title={row.penaltyReason || ''}>{row.penaltyPoints} pts</span>
                      : <Dash />}
                  </TableCell>
                  <TableCell>{row.replacementName || <Dash />}</TableCell>
                </UITableRow>
              ))}
            </TableBody>
          </Table>
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
        {isEmpty  ? <Dash />  :
         isBye    ? 'BYE'                                      :
         `${entry.familyName}${entry.firstName ? ', ' + entry.firstName : ''}`}
      </span>
      {isWithdrawn && <span className="text-destructive font-bold text-xs"> WD</span>}
      {!isBye && !isEmpty && entry.playerState && (
        <span className="t-ds-state">{entry.playerState}</span>
      )}
      {!isBye && !isEmpty && entry.statusCode && (
        <span className={cn(scBadgeCls, 'ml-1.5')}>{entry.statusCode}</span>
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
// Qualifying draws never crown a champion — they stop at the deciding round
// once enough winners exist to promote. Real AITA qualifying sheets only
// ever label rounds "2nd Round"/"3rd Round"/... up to "Finals" at the
// deciding round — Quarter-Finals/Semi-Finals never appear there.
function roundLabel(round, total, drawType = 'main') {
  const fromEnd = total - round;
  if (drawType === 'qualifying') {
    return fromEnd === 0 ? 'Finals' : `R${round}`;
  }
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-sm max-w-md w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <span className="text-lg font-display font-extrabold tracking-tight">Enter Result</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary shrink-0">✕</button>
        </div>

        {/* Match players */}
        <div className="flex items-center justify-center gap-2.5 py-3 border-b border-border mb-4 text-center">
          <div className="flex-1 font-bold text-sm">{p1Name}</div>
          <div className="text-muted-foreground text-xs font-mono shrink-0">vs</div>
          <div className="flex-1 font-bold text-sm">{p2Name}</div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Outcome type */}
          <Field label="Outcome">
            <div className="flex gap-1.5 flex-wrap">
              {OUTCOME_TYPES.map(o => (
                <button key={o} type="button"
                  className={cn('flex-1 min-w-20 rounded-sm border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide', outcomeType === o ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                  onClick={() => setOutcomeType(o)}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </Field>

          {/* Score (shown only for "score" outcome) */}
          {outcomeType === 'score' && (
            <Field label="Score">
              <Input
                value={score}
                onChange={e => setScore(e.target.value)}
                placeholder="e.g. 6-3, 7-5  or  6-4, 3-6, 6-2"
                autoFocus
              />
            </Field>
          )}

          {/* Winner */}
          <Field label="Winner">
            <div className="flex gap-2">
              {entry1 && !entry1.isBye && (
                <button type="button"
                  className={cn('flex-1 rounded-sm border px-3 py-2.5 text-sm font-semibold text-center', winnerId === match.entry1Id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                  onClick={() => setWinnerId(match.entry1Id)}>
                  {p1Name}
                </button>
              )}
              {entry2 && !entry2.isBye && (
                <button type="button"
                  className={cn('flex-1 rounded-sm border px-3 py-2.5 text-sm font-semibold text-center', winnerId === match.entry2Id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                  onClick={() => setWinnerId(match.entry2Id)}>
                  {p2Name}
                </button>
              )}
            </div>
          </Field>

          {/* Umpire */}
          <Field label="Umpire (optional)">
            <Input
              value={umpire}
              onChange={e => setUmpire(e.target.value)}
              placeholder="Umpire name"
            />
          </Field>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Result'}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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
const SLOT_H = 116;  // height each R1 match occupies (px) — tall enough to fit a score/outcome/CTA row without overlapping the next match
const CARD_H = 100;  // assumed card height used to vertically center a card within its slot
const COL_W  = 236;  // column width (px)
const COL_GAP = 40;  // gap between columns (px)

function BracketView({ matches, entries, totalRounds, isOwner, onScore, drawType = 'main' }) {
  const entryMap = new Map(entries.map(e => [e.id, e]));

  const byRound = {};
  for (let r = 1; r <= totalRounds; r++) {
    byRound[r] = (matches.filter(m => m.round === r) || [])
      .sort((a, b) => a.matchSlot - b.matchSlot);
  }

  const gridTemplateColumns = `repeat(${totalRounds}, minmax(${COL_W}px, 1fr))`;

  return (
    <div className="t-bracket-wrap">
      {/* Round labels */}
      <div className="t-bracket-labels" style={{ gridTemplateColumns, columnGap: COL_GAP }}>
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
          <div key={r} className="t-bracket-label">
            {roundLabel(r, totalRounds, drawType)}
          </div>
        ))}
      </div>

      {/* Bracket grid — each round is a normal-flow column; a match's
          vertical offset is the same "center it between its two feeder
          matches" math the old absolute layout used, expressed as a
          margin-top gap from the previous card's bottom edge instead of a
          top: <px> coordinate. */}
      <div className="t-bracket-grid" style={{ gridTemplateColumns, columnGap: COL_GAP }}>
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
          const slotH = Math.pow(2, round - 1) * SLOT_H;
          const roundMatches = byRound[round] || [];
          let prevBottom = 0;

          return (
            <div key={round} className="t-bracket-col">
              {roundMatches.map(match => {
                const top = (match.matchSlot - 1) * slotH + (slotH - CARD_H) / 2;
                const marginTop = top - prevBottom;
                prevBottom = top + CARD_H;

                const entry1 = entryMap.get(match.entry1Id);
                const entry2 = entryMap.get(match.entry2Id);

                // Clickable if organizer, not yet complete, and has at least one real player
                const hasPlayers = (match.entry1Id || match.entry2Id);
                const isClickable = isOwner && match.status !== 'complete' && !!hasPlayers;

                return (
                  <div key={match.id} style={{ marginTop }}>
                    <BracketMatchCard
                      match={match}
                      entry1={entry1}
                      entry2={entry2}
                      isClickable={isClickable}
                      onClick={() => onScore(match)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InterestedPlayersPanel (phase 46) — players who declared "I'm playing"
// this AITA tournament before it was claimed by an organizer. Only rendered
// for a claimed tournament's owner (week.source === 'aita_claimed'); resolves
// each one into a real draw entry (Accept) or drops it (Decline) via
// resolveAitaInterest, which reuses the same addDrawEntry organizer manual-
// entry already goes through.
// ---------------------------------------------------------------------------
function InterestedPlayersPanel({ eventId, onAccepted }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getUnresolvedAitaInterestForEvent(eventId)
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [eventId]);

  async function handleResolve(row, accept) {
    setBusyId(row.id);
    setError('');
    try {
      await api.resolveAitaInterest(row, eventId, accept);
      setRows(prev => prev.filter(r => r.id !== row.id));
      if (accept) await onAccepted();
    } catch (e) {
      setError(e.message || 'Could not save — try again');
    } finally {
      setBusyId(null);
    }
  }

  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
        {rows.length} player{rows.length === 1 ? '' : 's'} already said they're playing this tournament
      </div>
      <div className="divide-y divide-border">
        {rows.map(row => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1 min-w-40">
              <div className="text-sm font-semibold">{row.displayName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {[row.aitaReg, row.stateAbbr, row.ranking ? `Rank ${row.ranking}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Button size="sm" disabled={busyId === row.id} onClick={() => handleResolve(row, true)}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => handleResolve(row, false)}>
              Decline
            </Button>
          </div>
        ))}
      </div>
      {error && <div className="px-4 py-2 text-xs text-destructive">{error}</div>}
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
  const [activeTab, setActiveTab] = useState('entries'); // 'entries' | 'main' | 'qualifying' | 'alternates' | 'withdrawal' | 'lucky_losers' | 'audit_log'
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

  // Phase 44 — computed Tracker Rating, batched once per entries load rather
  // than one query per row. Keyed by playerId (preferred) or aitaReg, so
  // EntryRow can look a rating up the same way compute-ratings identifies a
  // subject. Singles only — this is a seeding aid for the pre-draw list.
  const [ratingsBySubjectKey, setRatingsBySubjectKey] = useState(new Map());
  useEffect(() => {
    if (event?.isDoubles || entries.length === 0) { setRatingsBySubjectKey(new Map()); return; }
    let cancelled = false;
    const playerIds = [...new Set(entries.map(e => e.playerId).filter(Boolean))];
    const aitaRegs = [...new Set(entries.filter(e => !e.playerId).map(e => e.aitaReg).filter(Boolean))];
    if (playerIds.length === 0 && aitaRegs.length === 0) { setRatingsBySubjectKey(new Map()); return; }
    api.getPlayerRatingsBatch({ playerIds, aitaRegs })
      .then(ratings => {
        if (cancelled) return;
        const map = new Map();
        for (const r of ratings) map.set(r.subjectKey, r);
        setRatingsBySubjectKey(map);
      })
      .catch(() => { if (!cancelled) setRatingsBySubjectKey(new Map()); });
    return () => { cancelled = true; };
  }, [entries, event?.isDoubles]);

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

  // Consolidated "Entries" tab — loads main + qualifying independently of
  // drawType/activeTab (same reasoning as withdrawnEntries above) so the
  // summary is always complete regardless of which other tab was last open.
  const [allMainEntries, setAllMainEntries] = useState([]);
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    api.getDrawEntries(eventId, 'main')
      .then(data => { if (!cancelled) setAllMainEntries(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, event]);

  const [allQualEntries, setAllQualEntries] = useState([]);
  useEffect(() => {
    if (!event?.hasQualifying) return;
    let cancelled = false;
    api.getDrawEntries(eventId, 'qualifying')
      .then(data => { if (!cancelled) setAllQualEntries(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [eventId, event?.hasQualifying]);

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
  // maxPos is the PHYSICAL bracket size (always a power of two) — a nominal
  // "48" draw is physically a 64-slot bracket padded with BYEs (verified
  // against real AITA sheets: Seed 2 sits at physical position 64, not 48).
  // event.drawSize/qualifyingSize stay nominal for labels and composition math.
  const nominalMax  = event ? (drawType === 'main' ? event.drawSize : (event.qualifyingSize || 32)) : 0;
  const maxPos      = bracketSize(nominalMax);
  const numSeeds    = event?.numSeeds || 4;

  // Qualifying draws don't run to a single champion — they stop at the
  // "deciding round" once enough winners exist to fill the promotion spots
  // (verified: real qualifying sheets end at "Finals"/"Qualifiers", never a
  // Champion box). Main draw always plays out the full physical bracket.
  const qualDecidingRound = (event?.qualifyingSize && event?.qualifyingSpots)
    ? Math.round(Math.log2(bracketSize(event.qualifyingSize) / event.qualifyingSpots))
    : 0;
  const totalRounds = maxPos <= 0 ? 0
    : (drawType === 'qualifying' && qualDecidingRound > 0)
      ? qualDecidingRound
      : Math.ceil(Math.log2(maxPos));
  const qualDecidingMatches = matches.filter(m => m.round === qualDecidingRound);
  const qualComplete = drawType === 'qualifying'
    && qualDecidingRound > 0
    && qualDecidingMatches.length === event?.qualifyingSpots
    && qualDecidingMatches.every(m => m.status === 'complete');
  // Alternates live at positions beyond the draw size — keep them out of the
  // main bracket entries (fill %, BYE count, drawFull, DrawSheet/Bracket math).
  const mainEntries      = entries.filter(e => e.position <= maxPos);
  // Waitlist ordered by ranking (doc §4) — lower ranking number = better,
  // unranked players fall to the back; join order (position) breaks ties.
  // Onsite/walk-in sign-ins (no prior ranked registration) always sort after
  // the ranked/online alternates — verified against the rule text's "alternate
  // list, or any onsite alternate" distinction (see phase24_onsite_signin.sql).
  const alternateEntries = entries.filter(e => e.position > maxPos)
    .sort((a, b) =>
      (a.isOnsiteSignin ? 1 : 0) - (b.isOnsiteSignin ? 1 : 0)
      || (a.ranking || Infinity) - (b.ranking || Infinity)
      || a.position - b.position
    );
  const sortedEntries = [...mainEntries].sort((a, b) => a.position - b.position);
  const playerCount = mainEntries.filter(e => !e.isBye).length;
  const byeCount    = mainEntries.filter(e => e.isBye).length;
  const fillPct     = maxPos > 0 ? Math.min(Math.round(mainEntries.length / maxPos * 100), 100) : 0;
  const hasSeededPlayers = mainEntries.some(e => e.seed && !e.isBye);
  const hasGaps     = mainEntries.length < maxPos;
  const drawFull    = mainEntries.length === maxPos && maxPos > 0;

  const entriesSummaryRows = buildEntriesSummary({ allMainEntries, allQualEntries, withdrawnEntries, luckyLosers, event });

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
      setWithdrawnEntries(prev => prev.filter(e => e.id !== entryId));
    } catch (err) { setError(err.message); }
  }

  // Phase 47 — organiser confirms/reverts an offline entry-fee payment.
  async function handleTogglePayment(entryId, status) {
    try {
      const updated = await api.updateEntryPaymentStatus(entryId, status);
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
    } catch (err) { setError(err.message); }
  }

  // Same payment toggle, routed to whichever state bucket the consolidated
  // Entries tab pulled the row from, since that tab merges four separate
  // lists (main/qualifying/withdrawal/lucky-loser) instead of one.
  async function handleEntriesTabTogglePayment(entryId, status, sourceGroup) {
    try {
      const updated = await api.updateEntryPaymentStatus(entryId, status);
      if (sourceGroup === 'main') setAllMainEntries(prev => prev.map(e => e.id === entryId ? updated : e));
      else if (sourceGroup === 'qualifying') setAllQualEntries(prev => prev.map(e => e.id === entryId ? updated : e));
      else if (sourceGroup === 'withdrawal') setWithdrawnEntries(prev => prev.map(e => e.id === entryId ? updated : e));
      else if (sourceGroup === 'lucky_loser') setLuckyLosers(prev => prev.map(ll => ll.entryId === entryId ? { ...ll, entry: updated } : ll));
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
    } catch (err) { setError(err.message); }
  }

  async function handleMoveEntry(entryId, targetGroup) {
    try {
      const moved = await api.moveEntryToGroup(entryId, targetGroup, eventId);
      // Remove from all local state lists, then add to the right one
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setWithdrawnEntries(prev => prev.filter(e => e.id !== entryId));
      if (targetGroup === 'withdrawal') {
        setWithdrawnEntries(prev => [...prev, moved].sort((a, b) => a.position - b.position));
      } else {
        // main / qualifying / alternates — reload both main + qual entries since
        // the moved entry may have changed draw_type
        const [mainData, qualData] = await Promise.all([
          api.getDrawEntries(eventId, 'main'),
          api.getDrawEntries(eventId, 'qualifying'),
        ]);
        setEntries(drawType === 'qualifying' ? qualData : mainData);
      }
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
      const reseeded = applySeeding(mainEntries, maxPos, numSeeds, drawType);
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

  // ---- RANDOM DRAW (shuffle positions, keep seeds in ITF slots) ------------
  async function handleRandomizeDraw() {
    if (!window.confirm(
      'Randomize draw? Players will be shuffled into random positions.\n' +
      'Seeds will be placed in their correct ITF positions.\n' +
      'BYEs will be auto-filled for any empty slots.\n' +
      'You can swap players manually afterwards, then click "Publish Draw".'
    )) return;
    setSeeding(true);
    setError('');
    try {
      // Randomize only real players (drop existing BYEs first)
      const playerEntries = mainEntries.filter(e => !e.isBye);
      const randomized    = randomizeDraw(playerEntries, maxPos, numSeeds, drawType);
      // Auto-fill BYEs for any empty slots
      const byeEntries    = buildByeEntries(maxPos, randomized);
      const allEntries    = [...randomized, ...byeEntries];
      // Persist — removes old BYEs + saves randomized order in one call
      const saved = await api.saveDrawEntries(eventId, drawType, [...allEntries, ...alternateEntries]);
      setEntries(saved);
      setViewMode('drawsheet'); // show draw sheet so organiser can review
    } catch (err) { setError(err.message); }
    finally { setSeeding(false); }
  }

  // ---- GENERATE BRACKET / PUBLISH DRAW ------------------------------------
  // Best-effort in-app + email notification. Never blocks the underlying
  // organiser action if it fails — the action itself already succeeded.
  async function notifyUsers(userIds, { type, title, body, html }) {
    if (!userIds || userIds.length === 0) return;
    try {
      await api.createNotificationsForUsers(userIds, { type, title, body, tournamentWeekId: weekId, eventId });
      await api.sendNotificationEmails(userIds, { subject: title, html: html || `<p>${body || title}</p>` });
      await api.sendPushNotifications(userIds, { title, body, link: `/tournaments/${weekId}/events/${eventId}` });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Notification failed:', err.message);
    }
  }

  async function handleGenerateBracket() {
    const isPublished = event?.status !== 'setup';
    const msg = isPublished
      ? 'Regenerate bracket? All existing match results will be lost.'
      : 'Publish draw? BYEs will be auto-filled for empty slots, positions will be locked and the draw will be visible to all players. Continue?';
    if (!window.confirm(msg)) return;
    setGenerating(true);
    setError('');
    try {
      // Auto-fill BYEs before generating bracket if slots are missing
      let allEntries = entries;
      const playerEntriesForBye = mainEntries.filter(e => !e.isBye);
      const existingByes = mainEntries.filter(e => e.isBye);
      if (playerEntriesForBye.length < maxPos && existingByes.length === 0) {
        const byes = buildByeEntries(maxPos, playerEntriesForBye);
        const created = await api.bulkAddDrawEntries(eventId, drawType, byes);
        allEntries = [...entries, ...created];
        setEntries(allEntries.sort((a, b) => a.position - b.position));
      }

      const sorted = [...allEntries].filter(e => e.position <= maxPos).sort((a, b) => a.position - b.position);
      const maxRound = drawType === 'qualifying' && qualDecidingRound > 0 ? qualDecidingRound : undefined;
      const initialized = await api.initializeEventMatches(eventId, drawType, sorted, maxRound);

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

      const playerIds = allEntries.filter(e => e.playerId && !e.isBye).map(e => e.playerId);
      notifyUsers(playerIds, {
        type: 'draw_published',
        title: `Draw published: ${event?.category} ${event?.ageGroup}`,
        body: `The ${drawType === 'qualifying' ? 'qualifying' : 'main'} draw for ${week?.name || 'your tournament'} has been published.`,
      });
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

      const playerIds = winners.filter(w => w.playerId).map(w => w.playerId);
      notifyUsers(playerIds, {
        type: 'qualifier_promoted',
        title: `You qualified: ${event?.category} ${event?.ageGroup}`,
        body: `Congratulations — you've been promoted from qualifying to the main draw of ${week?.name || 'your tournament'}.`,
      });
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
    const posA = selectedEntry.position;
    const posB = entry.position;
    const newEntries = swapPositions(entries, posA, posB);
    setSelectedEntry(null);

    api.swapEntryPositions(selectedEntry.id, posA, entry.id, posB)
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
    if (altEntry.playerId) {
      notifyUsers([altEntry.playerId], {
        type: 'withdrawal_replacement',
        title: `You're in: ${event?.category} ${event?.ageGroup}`,
        body: `A slot opened up in ${week?.name || 'your tournament'} and you've been called in from the alternates list.`,
      });
    }
  }

  async function handleCallInLuckyLoser(ll) {
    const target = withdrawingEntry;
    await api.callInReplacement(target.id, ll.entry, 'lucky_loser');
    await api.clearScheduleForEntry(target.id);
    await reloadAfterWithdrawal();
    if (ll.entry?.playerId) {
      notifyUsers([ll.entry.playerId], {
        type: 'withdrawal_replacement',
        title: `You're in: ${event?.category} ${event?.ageGroup}`,
        body: `A main-draw slot opened up in ${week?.name || 'your tournament'} and you've been called in as a lucky loser.`,
      });
    }
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
      if (ll.entry?.playerId) {
        notifyUsers([ll.entry.playerId], {
          type: 'withdrawal_replacement',
          title: `You're in: ${event?.category} ${event?.ageGroup}`,
          body: `A main-draw slot opened up in ${week?.name || 'your tournament'} and you've been called in as a lucky loser.`,
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  // ---- RENDER --------------------------------------------------------------
  if (loading) return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>
    </div>
  );

  if (error && !event) return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
    </div>
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Link to="/tournaments" className="hover:text-foreground">Tournaments</Link>
              <span>/</span>
              <Link to={`/tournaments/${weekId}`} className="hover:text-foreground">{week?.name}</Link>
              <span>/</span>
              <span className="text-foreground">{event?.category} {event?.ageGroup}</span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">{event?.category}</h1>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              {event?.ageGroup} · {week?.name}
              {event?.entriesOpen && (
                <span className="inline-flex items-center rounded-sm bg-chart-3/15 text-chart-3 px-2 py-0.5 text-[0.68rem] font-semibold">
                  Entries Open
                </span>
              )}
            </div>
          </div>

          {/* Action buttons — context-aware; hidden on read-only summary tabs */}
          {!['lucky_losers', 'entries'].includes(activeTab) && (
          <div className="flex flex-wrap items-start gap-2">
            {isOwner && viewMode !== 'bracket' && (
              <>
                <Button onClick={() => { setEditingEntry(null); setShowAdd(true); }}>+ Add Player</Button>
                <Button variant="outline" onClick={() => setShowBulk(true)}>Bulk Import</Button>
                {hasSeededPlayers && (
                  <Button variant="outline" onClick={handleAutoSeed} disabled={seeding}>
                    {seeding ? 'Seeding…' : '⚡ Auto-Seed'}
                  </Button>
                )}
                {hasGaps && !byeCount && (
                  <Button variant="outline" onClick={handleFillByes} disabled={fillingByes}>
                    {fillingByes ? 'Filling…' : '+ Fill BYEs'}
                  </Button>
                )}
                {byeCount > 0 && !hasGaps && (
                  <Button variant="outline" onClick={handleClearByes}>Clear BYEs</Button>
                )}
                {mainEntries.length > 0 && !hasGaps && (
                  <Button
                    variant={swapMode ? 'default' : 'outline'}
                    onClick={toggleSwapMode}
                  >
                    {swapMode ? (selectedEntry ? `Swap: ${selectedEntry.familyName}…` : 'Click to swap') : '⇅ Swap'}
                  </Button>
                )}
              </>
            )}
            {/* Randomize Draw — organiser only, before publishing */}
            {isOwner && playerCount > 0 && event?.status === 'setup' && (
              <Button onClick={handleRandomizeDraw} disabled={seeding}>
                {seeding ? 'Shuffling…' : '🎲 Randomize Draw'}
              </Button>
            )}
            {/* Publish Draw / Re-generate Bracket */}
            {isOwner && playerCount > 0 && (
              <Button onClick={handleGenerateBracket} disabled={generating}>
                {generating
                  ? 'Publishing…'
                  : event?.status !== 'setup'
                    ? '↺ Regenerate Bracket'
                    : '▶ Publish Draw'}
              </Button>
            )}
            {/* Promote Qualifiers — visible when qualifying draw is fully decided */}
            {isOwner && qualComplete && (
              <Button className="bg-chart-3 text-white hover:bg-chart-3/90" onClick={handlePromoteQualifiers}>
                ✓ Promote Qualifiers → Main
              </Button>
            )}
            {/* Open / Close / Freeze entries — organiser only */}
            {isOwner && (
              <>
                <Button
                  className={cn(event?.entriesOpen ? 'bg-chart-2 text-white hover:bg-chart-2/90' : 'bg-chart-3 text-white hover:bg-chart-3/90')}
                  onClick={async () => {
                    try {
                      const opening = !event?.entriesOpen;
                      const updated = await api.updateEvent(eventId, { entriesOpen: opening });
                      setEvent(updated);
                      if (opening) {
                        const tournamentYear = new Date(week?.startDate || Date.now()).getFullYear();
                        const eligibleIds = await api.getEligiblePlayerUserIds(
                          event.ageGroup, tournamentYear, week?.playingUpAllowed, week?.playingDownAllowed,
                        );
                        notifyUsers(eligibleIds, {
                          type: 'entries_open',
                          title: `Entries open: ${event.category} ${event.ageGroup}`,
                          body: `Nominations are now open for ${event.category} ${event.ageGroup} at ${week?.name || 'a tournament'}. Enter before the deadline.`,
                        });
                      }
                    } catch (err) { alert(err.message); }
                  }}
                >
                  {event?.entriesOpen ? 'Close Entries' : 'Open Entries'}
                </Button>
                {event?.entriesOpen && (
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      if (!window.confirm('Freeze entries? Players will no longer be able to self-enter or withdraw online. This cannot be undone easily.')) return;
                      try {
                        const updated = await api.updateEvent(eventId, { entriesOpen: false, entryCloseDate: new Date().toISOString().slice(0, 10) });
                        setEvent(updated);
                      } catch (err) { alert(err.message); }
                    }}
                  >
                    🔒 Freeze Entries
                  </Button>
                )}
              </>
            )}
            {/* PDF draw sheet — always available when entries exist */}
            {mainEntries.length > 0 && (
              <Button
                variant="outline"
                onClick={() => generateDrawSheetPDF({
                  event: { ...event, drawType },
                  week,
                  entries: sortedEntries,
                  matches,
                })}
              >
                ⬇ PDF
              </Button>
            )}
          </div>
          )}
        </div>

      {isOwner && week?.source === 'aita_claimed' && (
        <InterestedPlayersPanel
          eventId={eventId}
          onAccepted={async () => {
            const fresh = await api.getDrawEntries(eventId, drawType);
            setEntries(fresh);
          }}
        />
      )}

      {/* Draw-type tabs — always visible */}
      <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card">
        <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'entries' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => { setActiveTab('entries'); setSwapMode(false); setSelectedEntry(null); }}>
          Entries{entriesSummaryRows.length > 0 ? ` (${entriesSummaryRows.length})` : ''}
        </button>
        <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'main' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => { setActiveTab('main'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); setMatches([]); }}>
          Main Draw ({event?.drawSize ?? '?'})
        </button>
        {event?.hasQualifying && (
          <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'qualifying' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setActiveTab('qualifying'); setDrawType('qualifying'); setSwapMode(false); setSelectedEntry(null); setMatches([]); }}>
            Qualifying ({event.qualifyingSize || '—'})
          </button>
        )}
        <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'alternates' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => { setActiveTab('alternates'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); }}>
          Alternates{alternateEntries.length > 0 ? ` (${alternateEntries.length})` : ''}
        </button>
        <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'withdrawal' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => { setActiveTab('withdrawal'); setSwapMode(false); setSelectedEntry(null); }}>
          Withdrawal{withdrawnEntries.length > 0 ? ` (${withdrawnEntries.length})` : ''}
        </button>
        {event?.hasQualifying && (
          <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'lucky_losers' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setActiveTab('lucky_losers'); setDrawType('main'); setSwapMode(false); setSelectedEntry(null); }}>
            Lucky Losers
          </button>
        )}
        {isOwner && (
          <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', activeTab === 'audit_log' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => { setActiveTab('audit_log'); setSwapMode(false); setSelectedEntry(null); }}>
            Audit Log
          </button>
        )}
      </div>

      {/* View toggle + stats — only for draw tabs; hidden from players before draw is published */}
      {(activeTab === 'main' || activeTab === 'qualifying') && (isOwner || event?.status !== 'setup') && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground flex items-center flex-wrap gap-1">
          <span>{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          {byeCount > 0 && <span> · {byeCount} BYE{byeCount !== 1 ? 's' : ''}</span>}
          {hasGaps && <span> · {maxPos - mainEntries.length} open</span>}
          {activeTab === 'main' && event?.isDoubles && playerCount > 0 && playerCount < DOUBLES_MIN_PAIRS_FOR_POINTS && (
            <span title="AITA rule: doubles draws need at least 8 pairs for ranking points to be awarded.">
              {' '}· below {DOUBLES_MIN_PAIRS_FOR_POINTS} pairs — no ranking points
            </span>
          )}
          {event?.status && event.status !== 'setup' && (
            <span className={cn('inline-flex items-center rounded-sm px-2 py-0.5 text-[0.68rem] font-semibold ml-2', STATUS_STYLES[event.status] || 'bg-muted text-muted-foreground')}>
              {event.status.replace('_', ' ')}
            </span>
          )}
        </div>
        <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card">
          <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setViewMode('list')}>List</button>
          {matches.length === 0 && (
            <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', viewMode === 'drawsheet' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setViewMode('drawsheet')}>Draw Sheet</button>
          )}
          {matches.length > 0 && (
            <button className={cn('px-3 py-1.5 rounded-sm text-xs font-semibold', viewMode === 'bracket' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setViewMode('bracket')}>Bracket</button>
          )}
        </div>
      </div>
      )}

      {/* Progress bar — only for draw tabs; organiser only before publish */}
      {(activeTab === 'main' || activeTab === 'qualifying') && (isOwner || event?.status !== 'setup') && viewMode !== 'bracket' && (
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span><strong>{mainEntries.length}</strong> / {maxPos} positions filled</span>
            <span className="text-muted-foreground">{fillPct}%</span>
          </div>
          <div className="h-2 rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-primary" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}
      {(activeTab === 'main' || activeTab === 'qualifying') && swapMode && (
        <div className="rounded-sm bg-primary/10 border border-primary/30 text-accent-ink text-sm px-3 py-2 flex items-center gap-3">
          {selectedEntry ? `Click another player to swap with ${selectedEntry.familyName}.`
            : 'Click any player to select, then click another to swap positions.'}
          <button className="ml-auto bg-transparent text-accent-ink underline text-sm" onClick={toggleSwapMode}>Cancel</button>
        </div>
      )}

      {/* ---- Content ---- */}
      {activeTab === 'entries' ? (
        <EntriesSummaryTable
          isDoubles={event?.isDoubles}
          isOwner={isOwner}
          rows={entriesSummaryRows}
          onTogglePayment={isOwner ? handleEntriesTabTogglePayment : undefined}
        />
      ) : activeTab === 'audit_log' ? (
        <AuditLogPanel eventId={eventId} />
      ) : activeTab === 'lucky_losers' ? (
        <LuckyLosersPanel
          luckyLosers={luckyLosers}
          mainEntries={mainEntries}
          isOwner={isOwner}
          drawing={drawingLL}
          onRandomDraw={handleRandomDrawLuckyLosers}
          onCallIn={handleCallInLuckyLoserFromTab}
        />
      ) : activeTab === 'alternates' ? (
        <div>
          {alternateEntries.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No alternates yet. Use + Add Player (alternate) or import via Bulk Import → Alternates tab.</div>
          ) : (
            <div className="rounded-sm border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <UITableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>AITA Reg</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Rank</TableHead>
                    {isOwner && <TableHead />}
                  </UITableRow>
                </TableHeader>
                <TableBody>
                  {alternateEntries.map(entry => (
                    <AlternateRow key={entry.id} entry={entry} maxPos={maxPos} isOwner={isOwner} onDelete={handleDeleteEntry} onMove={isOwner ? handleMoveEntry : undefined} onTogglePayment={isOwner ? handleTogglePayment : undefined} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : activeTab === 'withdrawal' ? (
        <div>
          {withdrawnEntries.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No withdrawal list entries. Use Bulk Import → Full List to import the full acceptance list including withdrawals.</div>
          ) : (
            <div className="rounded-sm border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <UITableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>AITA Reg</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Type</TableHead>
                  </UITableRow>
                </TableHeader>
                <TableBody>
                  {withdrawnEntries.map((entry, i) => (
                    <UITableRow key={entry.id} className="opacity-60">
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm">
                          {entry.familyName}
                          {entry.firstName ? <span className="font-normal">, {entry.firstName}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>{entry.aitaReg || <Dash />}</TableCell>
                      <TableCell>{entry.playerState || <Dash />}</TableCell>
                      <TableCell>{entry.ranking || <Dash />}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-sm bg-chart-2/15 text-chart-2 px-2 py-0.5 text-[0.68rem] font-semibold">
                          {entry.withdrawalType || 'W'}
                        </span>
                      </TableCell>
                    </UITableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
      <div>
        {/* Players cannot see draw until organiser publishes it */}
        {!isOwner && event?.status === 'setup' && mainEntries.length > 0 ? (
          <div className="py-10 px-4 text-center">
            <div className="text-4xl mb-2.5">📋</div>
            <div className="font-bold text-base mb-1.5">Draw Not Yet Announced</div>
            <div className="text-sm text-muted-foreground">
              The organiser will publish the draw soon. Check back later.
            </div>
          </div>

        ) : mainEntries.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
            {isOwner ? 'No players entered yet. Use + Add Player or Bulk Import.' : 'No players entered yet.'}
          </div>

        ) : viewMode === 'bracket' ? (
          matches.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Bracket not generated yet.</div>
          ) : (
            <BracketView
              matches={matches}
              entries={sortedEntries}
              drawSize={maxPos}
              totalRounds={totalRounds}
              isOwner={isOwner}
              onScore={match => setScoringMatch(match)}
              drawType={drawType}
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
          <div className="space-y-4">
            <div className="rounded-sm border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <UITableRow>
                    <TableHead>Pos</TableHead>
                    <TableHead>Seed</TableHead>
                    <TableHead>{event?.isDoubles ? 'Team' : 'Player'}</TableHead>
                    <TableHead>AITA Reg</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>SC</TableHead>
                    {isOwner && !swapMode && <TableHead />}
                  </UITableRow>
                </TableHeader>
                <TableBody>
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
                      onMove={isOwner ? handleMoveEntry : undefined}
                      onTogglePayment={isOwner ? handleTogglePayment : undefined}
                      currentGroup={activeTab}
                      trackerRating={ratingsBySubjectKey.get(entry.playerId || entry.aitaReg)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Alternates — only meaningful for the main draw */}
            {activeTab === 'main' && !swapMode && (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">
                  Alternates{alternateEntries.length > 0 ? ` (${alternateEntries.length})` : ''}
                </div>
                {alternateEntries.length === 0 ? (
                  <div className="border border-dashed border-border rounded-sm p-4 text-center text-sm text-muted-foreground">
                    None yet — check "Alternate / replacement entry" in + Add Player.
                  </div>
                ) : (
                  <div className="rounded-sm border border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <UITableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>AITA Reg</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Rank</TableHead>
                          {isOwner && <TableHead />}
                        </UITableRow>
                      </TableHeader>
                      <TableBody>
                        {alternateEntries.map(entry => (
                          <AlternateRow
                            key={entry.id}
                            entry={entry}
                            maxPos={maxPos}
                            isOwner={isOwner}
                            onDelete={handleDeleteEntry}
                            onMove={isOwner ? handleMoveEntry : undefined}
                            onTogglePayment={isOwner ? handleTogglePayment : undefined}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
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
