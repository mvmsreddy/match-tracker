import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import TopNav from '../components/TopNav';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalRounds(entryCount) {
  return Math.ceil(Math.log2(entryCount));
}

function roundLabel(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-Finals';
  if (fromEnd === 2) return 'Quarter-Finals';
  return `Round ${round}`;
}

function entryDisplayName(entry) {
  if (!entry) return 'BYE';
  const seed = entry.seed ? `[${entry.seed}] ` : '';
  return `${seed}${entry.familyName}${entry.firstName ? ' ' + entry.firstName : ''}`;
}

function entryShortState(entry) {
  return entry?.playerState || '';
}

// Parse CSV-like bulk draw entry text
// Expected format per line: position, aitaReg, statusCode, rank, seed, familyName, firstName, playerState
// Blank fields are allowed; only position and familyName are required.
function parseBulkEntries(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const entries = [];
  const errors = [];
  lines.forEach((line, i) => {
    const parts = line.split(',').map(p => p.trim());
    const position = parseInt(parts[0], 10);
    const familyName = parts[5] || '';
    if (isNaN(position) || !familyName) {
      errors.push(`Line ${i + 1}: position and family name are required.`);
      return;
    }
    entries.push({
      position,
      aitaReg: parts[1] || '',
      statusCode: parts[2] || '',
      rank: parts[3] ? parseInt(parts[3], 10) : null,
      seed: parts[4] ? parseInt(parts[4], 10) : null,
      familyName,
      firstName: parts[6] || '',
      playerState: parts[7] || '',
      isAlternate: false,
    });
  });
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DrawSheet({ entries }) {
  if (entries.length === 0) return null;
  return (
    <div className="t-draw-sheet-wrap">
      <table className="t-draw-table">
        <thead>
          <tr>
            <th>#</th>
            <th>AITA Reg</th>
            <th>St.</th>
            <th>Rank</th>
            <th>Seed</th>
            <th>Family Name</th>
            <th>First Name</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, idx) => {
            const isMatchTop = idx % 2 === 0;
            return (
              <tr
                key={e.id}
                className={`t-draw-row${e.seed ? ' t-draw-seeded' : ''}${!isMatchTop ? ' t-draw-match-bottom' : ''}`}
              >
                <td className="t-draw-pos">{e.position}</td>
                <td className="t-draw-reg">{e.aitaReg || ''}</td>
                <td className="t-draw-st">{e.statusCode || ''}</td>
                <td className="t-draw-rank">{e.rank || ''}</td>
                <td className="t-draw-seed">{e.seed ? e.seed : ''}</td>
                <td className={`t-draw-fname${e.seed ? ' t-draw-seeded-name' : ''}`}>{e.familyName}</td>
                <td className="t-draw-gname">{e.firstName || ''}</td>
                <td className="t-draw-state">{e.playerState || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ match, entry1, entry2, isAdmin, onSaveScore }) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(match.score || '');
  const [winnerId, setWinnerId] = useState(match.winnerEntryId || '');
  const [umpire, setUmpire] = useState(match.umpire || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!winnerId) return;
    setSaving(true);
    try {
      await onSaveScore(match, { score, winnerEntryId: winnerId, umpire, status: 'complete' });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const winner = match.winnerEntryId
    ? (entry1?.id === match.winnerEntryId ? entry1 : entry2)
    : null;

  return (
    <div className={`t-match-card${match.status === 'complete' ? ' t-match-complete' : ''}`}>
      <div className="t-match-players">
        <div className={`t-match-player${winner?.id === entry1?.id ? ' t-match-winner' : ''}`}>
          <span className="t-match-seed">{entry1?.seed ? `[${entry1.seed}]` : ''}</span>
          <span className="t-match-name">{entry1 ? `${entry1.familyName}${entry1.firstName ? ' ' + entry1.firstName : ''}` : 'TBD'}</span>
          <span className="t-match-state">{entryShortState(entry1)}</span>
          {winner?.id === entry1?.id && <span className="t-match-winner-dot" title="Winner">●</span>}
        </div>

        <div className="t-match-vs">
          {match.score
            ? <span className="t-match-score">{match.score}</span>
            : <span className="t-match-vs-text">vs</span>
          }
        </div>

        <div className={`t-match-player${winner?.id === entry2?.id ? ' t-match-winner' : ''}`}>
          <span className="t-match-seed">{entry2?.seed ? `[${entry2.seed}]` : ''}</span>
          <span className="t-match-name">{entry2 ? `${entry2.familyName}${entry2.firstName ? ' ' + entry2.firstName : ''}` : 'TBD'}</span>
          <span className="t-match-state">{entryShortState(entry2)}</span>
          {winner?.id === entry2?.id && <span className="t-match-winner-dot" title="Winner">●</span>}
        </div>
      </div>

      {match.umpire && !editing && (
        <div className="t-match-umpire">Umpire: {match.umpire}</div>
      )}

      {isAdmin && !editing && (
        <button className="t-score-edit-btn" onClick={() => setEditing(true)}>
          {match.score ? 'Edit Score' : 'Enter Score'}
        </button>
      )}

      {editing && (
        <div className="t-score-form">
          <div className="field">
            <label>Score</label>
            <input
              value={score}
              onChange={e => setScore(e.target.value)}
              placeholder="e.g. 6-3, 6-4"
            />
          </div>
          <div className="field">
            <label>Winner</label>
            <select value={winnerId} onChange={e => setWinnerId(e.target.value)}>
              <option value="">Select winner…</option>
              {entry1 && <option value={entry1.id}>{entryDisplayName(entry1)}</option>}
              {entry2 && <option value={entry2.id}>{entryDisplayName(entry2)}</option>}
            </select>
          </div>
          <div className="field">
            <label>Umpire</label>
            <input
              value={umpire}
              onChange={e => setUmpire(e.target.value)}
              placeholder="Umpire name (optional)"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="action-btn primary" disabled={!winnerId || saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="action-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BracketView({ entries, matches, isAdmin, onSaveScore }) {
  if (entries.length === 0) return (
    <div className="history-empty">No draw entries yet. Upload the draw to see the bracket.</div>
  );

  const entryMap = Object.fromEntries(entries.map(e => [e.id, e]));
  const numRounds = totalRounds(entries.length);
  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1);

  return (
    <div>
      {rounds.map(round => {
        const roundMatches = matches.filter(m => m.round === round);
        return (
          <div key={round} className="t-bracket-round">
            <div className="t-round-label">{roundLabel(round, numRounds)}</div>
            <div className="t-match-list">
              {roundMatches.length === 0 && (
                <div className="t-no-matches">Matches will appear after the draw is initialized.</div>
              )}
              {roundMatches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  entry1={entryMap[m.entry1Id]}
                  entry2={entryMap[m.entry2Id]}
                  isAdmin={isAdmin}
                  onSaveScore={onSaveScore}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TournamentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState('');
  const [activeDrawType, setActiveDrawType] = useState(null);
  const [activeTab, setActiveTab] = useState('bracket'); // 'draw' | 'bracket'
  const [entries, setEntries] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingDraw, setLoadingDraw] = useState(false);

  // Draw entry upload state
  const [showUpload, setShowUpload] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [parseErrors, setParseErrors] = useState([]);
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Load tournament
  useEffect(() => {
    let cancelled = false;
    api.getTournament(id)
      .then(t => {
        if (!cancelled) {
          setTournament(t);
          setActiveDrawType(t.drawTypes[0] || 'qualifying');
        }
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Tournament not found'); });
    return () => { cancelled = true; };
  }, [id]);

  // Load draw entries + matches whenever draw type changes
  useEffect(() => {
    if (!tournament || !activeDrawType) return;
    let cancelled = false;
    setLoadingDraw(true);
    Promise.all([
      api.getDrawEntries(id, activeDrawType),
      api.getTournamentMatches(id, activeDrawType),
    ])
      .then(([ents, mats]) => {
        if (!cancelled) {
          setEntries(ents);
          setMatches(mats);
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoadingDraw(false); });
    return () => { cancelled = true; };
  }, [id, tournament, activeDrawType]);

  const isOwner = tournament && user.id === tournament.createdBy;

  // Save score + advance winner to next round
  const handleSaveScore = useCallback(async (match, { score, winnerEntryId, umpire, status }) => {
    const updated = await api.updateMatchScore(match.id, { score, winnerEntryId, umpire, status });
    setMatches(prev => prev.map(m => (m.id === updated.id ? updated : m)));

    // Advance winner to next round slot if there is one
    const numRounds = totalRounds(entries.length);
    if (match.round < numRounds) {
      await api.advanceWinner(id, match.drawType, match.round, match.matchSlot, winnerEntryId);
      // Refresh matches to show winner in next round
      const fresh = await api.getTournamentMatches(id, match.drawType);
      setMatches(fresh);
    }
  }, [id, entries.length]);

  // Parse bulk entries as user types
  function handleBulkChange(text) {
    setBulkText(text);
    if (!text.trim()) {
      setParseErrors([]);
      return;
    }
    const { errors } = parseBulkEntries(text);
    setParseErrors(errors);
  }

  async function handleUploadDraw() {
    const { entries: parsed, errors } = parseBulkEntries(bulkText);
    if (errors.length > 0) {
      setUploadError('Fix errors before saving.');
      return;
    }
    if (parsed.length === 0) {
      setUploadError('No entries found. Check your format.');
      return;
    }
    setUploadSaving(true);
    setUploadError('');
    try {
      const saved = await api.saveDrawEntries(id, activeDrawType, parsed);
      setEntries(saved);
      const mats = await api.initializeMatches(id, activeDrawType, saved);
      setMatches(mats);
      setShowUpload(false);
      setBulkText('');
      setParseErrors([]);
    } catch (err) {
      setUploadError(err.message || 'Failed to save draw');
    } finally {
      setUploadSaving(false);
    }
  }

  if (error) {
    return (
      <div className="root">
        <TopNav />
        <div className="history-empty">{error} <Link to="/tournaments">← Back to tournaments</Link></div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="root">
        <TopNav />
        <div className="history-empty">Loading tournament…</div>
      </div>
    );
  }

  return (
    <div className="root">
      <TopNav />

      {/* Header */}
      <div className="header">
        <Link to="/tournaments" className="t-back-link">← Tournaments</Link>
        <div className="title-row" style={{ marginTop: 6 }}>
          <div>
            <h1 className="title">{tournament.name}</h1>
            <div className="subtitle">
              {tournament.category}
              {tournament.grade ? ` · ${tournament.grade}` : ''}
              {tournament.city ? ` · ${tournament.city}` : ''}
              {tournament.stateAbbr ? `, ${tournament.stateAbbr}` : ''}
            </div>
          </div>
        </div>
        <div className="t-header-meta">
          {tournament.surface && <span className="t-badge">{tournament.surface}</span>}
          {tournament.startDate && (
            <span className="t-badge t-badge-grade">
              {tournament.startDate}{tournament.endDate ? ` – ${tournament.endDate}` : ''}
            </span>
          )}
          {tournament.referee && (
            <span className="t-header-referee">Referee: {tournament.referee}</span>
          )}
        </div>
      </div>

      {/* Draw Type Tabs */}
      {tournament.drawTypes.length > 1 && (
        <div className="t-draw-tabs">
          {tournament.drawTypes.map(dt => (
            <button
              key={dt}
              className={`t-draw-tab${activeDrawType === dt ? ' active' : ''}`}
              onClick={() => setActiveDrawType(dt)}
            >
              {dt.charAt(0).toUpperCase() + dt.slice(1)} Draw
            </button>
          ))}
        </div>
      )}

      {/* View Tabs */}
      <div className="t-view-tabs">
        <button
          className={`t-view-tab${activeTab === 'draw' ? ' active' : ''}`}
          onClick={() => setActiveTab('draw')}
        >
          Draw Sheet
        </button>
        <button
          className={`t-view-tab${activeTab === 'bracket' ? ' active' : ''}`}
          onClick={() => setActiveTab('bracket')}
        >
          Bracket &amp; Scores
        </button>
        {isOwner && (
          <button
            className="action-btn t-upload-btn"
            onClick={() => { setShowUpload(true); setUploadError(''); }}
          >
            Upload Draw
          </button>
        )}
      </div>

      {/* Upload Draw Modal */}
      {showUpload && (
        <div className="t-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="t-modal t-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="t-modal-header">
              <span className="t-modal-title">
                Upload {activeDrawType.charAt(0).toUpperCase() + activeDrawType.slice(1)} Draw
              </span>
              <button className="drawer-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              Paste one player per line in this format:<br />
              <code>position, aitaReg, statusCode, rank, seed, familyName, firstName, playerState</code><br />
              Example: <code>1, 442320, WC, 17, 1, BHOSALE, Trisha, MH</code><br />
              Leave blank fields as empty: <code>2, 447418, , , , JK, Kala, TS</code>
            </p>
            <textarea
              className="t-bulk-textarea"
              rows={14}
              value={bulkText}
              onChange={e => handleBulkChange(e.target.value)}
              placeholder={`1, 442320, WC, 17, 1, BHOSALE, Trisha, MH\n2, 447418, , , , JK, Kala, TS\n3, 443899, , , , KARNAM, Kashika, TS\n4, 447068, , , , KRISHNAMOHAN, Vidhula Reddy, TS`}
            />
            {parseErrors.length > 0 && (
              <div className="t-parse-errors">
                {parseErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            {uploadError && <div className="login-error">{uploadError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                className="action-btn primary"
                disabled={uploadSaving || parseErrors.length > 0 || !bulkText.trim()}
                onClick={handleUploadDraw}
              >
                {uploadSaving ? 'Saving…' : 'Save Draw & Initialize Matches'}
              </button>
              <button className="action-btn" onClick={() => setShowUpload(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="page-scroll">
        {loadingDraw && <div className="history-empty">Loading draw…</div>}

        {!loadingDraw && activeTab === 'draw' && (
          entries.length === 0
            ? <div className="history-empty">
                No entries for the {activeDrawType} draw yet.
                {isOwner && ' Click "Upload Draw" to enter players.'}
              </div>
            : <DrawSheet entries={entries} />
        )}

        {!loadingDraw && activeTab === 'bracket' && (
          <BracketView
            entries={entries}
            matches={matches}
            isAdmin={isOwner}
            onSaveScore={handleSaveScore}
          />
        )}
      </div>
    </div>
  );
}
