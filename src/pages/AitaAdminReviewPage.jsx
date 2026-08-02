import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '@/components/primitives/button';

// super_admin-only review queue for crowdsourced AITA uploads (draw sheets +
// EOD results sheets — see supabase/phase45_aita_crowdsourced.sql). No OCR:
// the admin transcribes each confirmed upload by hand — draws follow the
// organiser bulk-import tool's paste format (EventDetailPage.jsx's
// ImportPane, see parseDrawText()); results follow the event's existing
// round/match_slot bracket (see parseResultsText()).
const TABS = [
  { id: 'draws', label: 'Draw Sheets' },
  { id: 'results', label: 'Results Sheets' },
  { id: 'claims', label: 'Organizer Claims' },
];

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) !== 1 ? 's' : ''} ago`;
}

function isImagePath(path) {
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(path || '');
}

function UploadPreview({ storagePath, fetchUrl }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUrl(storagePath).then(u => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [storagePath, fetchUrl]);

  if (!url) return <div className="text-xs text-muted-foreground">Loading preview…</div>;
  if (isImagePath(storagePath)) {
    return <img src={url} alt="Uploaded sheet" className="max-h-64 rounded-sm border border-border" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-ink underline underline-offset-2">
      Open uploaded file ↗
    </a>
  );
}

// --------------------------------------------------------------------------
// Pending review — admin confirms/rejects that the upload matches the
// tournament it claims to be (the "wrong upload" guard).
// --------------------------------------------------------------------------
function PendingDrawQueue({ onConfirmed }) {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function reload() {
    api.getPendingAitaDrawUploads().then(setUploads).catch(e => setError(e.message || 'Could not load the queue'));
  }

  useEffect(() => { reload(); }, []);

  async function handleDecision(upload, correct) {
    setBusyId(upload.id);
    setError('');
    try {
      if (correct) {
        await api.confirmAitaDrawUpload(upload.id);
        onConfirmed();
      } else {
        await api.rejectAitaDrawUpload(upload.id);
      }
      setUploads(prev => prev.filter(u => u.id !== upload.id));
    } catch (e) {
      setError(e.message || 'Could not save — try again');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>;
  if (uploads === null) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  if (uploads.length === 0) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Nothing waiting for review.</div>;

  return (
    <div className="space-y-3">
      {uploads.map(u => {
        const t = u.tournament;
        return (
          <div key={u.id} className="rounded-sm border border-border bg-card p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Uploaded {timeAgo(u.uploadedAt)}</div>
              <UploadPreview storagePath={u.storagePath} fetchUrl={api.getAitaDrawUploadFileUrl} />
            </div>
            <div className="space-y-2 lg:w-72">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">This upload claims to be:</div>
              {t ? (
                <div className="text-sm">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {[t.venue, t.city].filter(Boolean).join(', ')}
                    {t.startDate && ` · ${t.startDate}`}
                    {t.grade && ` · ${t.grade}`}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Tournament record not found.</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" disabled={busyId === u.id} onClick={() => handleDecision(u, true)}>
                  Confirm — correct tournament
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => handleDecision(u, false)}>
                  Reject — wrong upload
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Transcribe + publish — same paste format as the organiser's bulk-import
// tool: one entry per line, comma- or tab-separated —
// Position, FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode
// (position is optional; auto-numbers in order when omitted).
// --------------------------------------------------------------------------
function parseDrawText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const entries = [];
  const errors = [];
  let autoPos = 1;

  lines.forEach((line, idx) => {
    const sep = line.includes('\t') ? '\t' : ',';
    const p = line.split(sep).map(x => x.trim());
    const firstNum = Number(p[0]);
    let pos, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode;

    if (p[0] !== '' && !isNaN(firstNum) && String(firstNum) === p[0]) {
      pos = firstNum;
      [, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode] = p;
    } else {
      pos = autoPos;
      [familyName, firstName, aitaReg, playerState, ranking, seed, statusCode] = p;
    }
    autoPos = Math.max(autoPos, pos) + 1;

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

  return { entries: entries.sort((a, b) => a.position - b.position), errors };
}

function PublishDrawForm({ upload, onPublished }) {
  const [drawType, setDrawType] = useState('main');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handlePreview() {
    const { entries, errors } = parseDrawText(text);
    setPreview(entries);
    setParseErrors(errors);
  }

  async function handlePublish() {
    setBusy(true);
    setError('');
    try {
      const result = await api.publishAitaDrawSheet({
        uploadId: upload.id,
        aitaTournamentId: upload.aitaTournamentId,
        drawType,
        entries: preview,
      });
      onPublished(upload.id, result);
    } catch (e) {
      setError(e.message || 'Could not publish — try again');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs font-semibold">
        <span className="text-muted-foreground">This upload is the:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`drawType-${upload.id}`} checked={drawType === 'qualifying'} onChange={() => setDrawType('qualifying')} />
          Qualifying Draw
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`drawType-${upload.id}`} checked={drawType === 'main'} onChange={() => setDrawType('main')} />
          Main Draw
        </label>
      </div>
      <textarea
        className="w-full h-32 rounded-sm border border-border bg-background p-2 text-xs font-mono"
        placeholder="One entry per line: Position, FamilyName, FirstName, AitaReg, State, Ranking, Seed, StatusCode"
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null); }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handlePreview} disabled={!text.trim() || busy}>
          Preview
        </Button>
        {preview && preview.length > 0 && (
          <Button size="sm" onClick={handlePublish} disabled={busy}>
            {busy ? 'Publishing…' : `Publish ${drawType === 'qualifying' ? 'Qualifying' : 'Main'} Draw (${preview.length} entries)`}
          </Button>
        )}
      </div>
      {parseErrors.length > 0 && (
        <div className="text-xs text-destructive space-y-0.5">{parseErrors.map((e, i) => <div key={i}>{e}</div>)}</div>
      )}
      {preview && preview.length > 0 && (
        <div className="border border-border rounded-sm overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="p-1.5 text-left">Pos</th>
                <th className="p-1.5 text-left">Name</th>
                <th className="p-1.5 text-left">AITA Reg</th>
                <th className="p-1.5 text-left">State</th>
                <th className="p-1.5 text-left">Seed</th>
                <th className="p-1.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-1.5">{e.position}</td>
                  <td className="p-1.5">{e.familyName}{e.firstName ? `, ${e.firstName}` : ''}</td>
                  <td className="p-1.5">{e.aitaReg}</td>
                  <td className="p-1.5">{e.playerState}</td>
                  <td className="p-1.5">{e.seed || ''}</td>
                  <td className="p-1.5">{e.statusCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

function ConfirmedDrawQueue({ refreshKey }) {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const [published, setPublished] = useState({}); // uploadId -> { week, event }

  useEffect(() => {
    api.getConfirmedAitaDrawUploads().then(setUploads).catch(e => setError(e.message || 'Could not load the queue'));
  }, [refreshKey]);

  function handlePublished(uploadId, result) {
    setPublished(prev => ({ ...prev, [uploadId]: result }));
  }

  if (error) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>;
  if (uploads === null) return null;
  if (uploads.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Confirmed — transcribe &amp; publish</div>
      {uploads.map(u => {
        const t = u.tournament;
        const result = published[u.id];
        return (
          <div key={u.id} className="rounded-sm border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold">{t?.name || 'Tournament'}</div>
              <div className="text-xs text-muted-foreground">Uploaded {timeAgo(u.uploadedAt)}</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4">
              <UploadPreview storagePath={u.storagePath} fetchUrl={api.getAitaDrawUploadFileUrl} />
              {result ? (
                <div className="text-sm">
                  Published — the tournament is now live.{' '}
                  <Link to={`/tournaments/${result.week.id}/events/${result.event.id}`} className="text-accent-ink underline underline-offset-2">
                    Open it ↗
                  </Link>
                </div>
              ) : (
                <PublishDrawForm upload={u} onPublished={handlePublished} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrawSheetReviewQueue() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-6">
      <ConfirmedDrawQueue refreshKey={refreshKey} />
      <PendingDrawQueue onConfirmed={() => setRefreshKey(k => k + 1)} />
    </div>
  );
}

// --------------------------------------------------------------------------
// Results Sheets — always requires admin approval (no lighter single-confirm
// gate like draws get, since there's no "wrong tournament" ambiguity here —
// the upload is already tied to a real, published event). One paste format:
// Round, MatchSlot, WinnerPosition, Score, OutcomeType — read straight off
// the event's existing bracket (round/match_slot already exist from
// publishAitaDrawSheet), so the admin just needs the photo + the draw sheet
// side by side.
// --------------------------------------------------------------------------
function parseResultsText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const results = [];
  const errors = [];

  lines.forEach((line, idx) => {
    const sep = line.includes('\t') ? '\t' : ',';
    const [round, matchSlot, winnerPosition, score, outcomeType] = line.split(sep).map(x => x.trim());
    if (!round || !matchSlot || !winnerPosition) {
      errors.push(`Line ${idx + 1}: round, match slot and winner position are required`);
      return;
    }
    results.push({
      round: Number(round),
      matchSlot: Number(matchSlot),
      winnerPosition: Number(winnerPosition),
      score: (score || '').trim(),
      outcomeType: (outcomeType || 'score').trim().toLowerCase() || 'score',
    });
  });

  return { results, errors };
}

function ApplyResultsForm({ upload, onApplied }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handlePreview() {
    const { results, errors } = parseResultsText(text);
    setPreview(results);
    setParseErrors(errors);
  }

  async function handleApply() {
    setBusy(true);
    setError('');
    try {
      const result = await api.applyAitaResultsSheet({ uploadId: upload.id, eventId: upload.eventId, results: preview });
      onApplied(upload.id, result);
    } catch (e) {
      setError(e.message || 'Could not apply — try again');
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError('');
    try {
      await api.rejectAitaResultsUpload(upload.id);
      onApplied(upload.id, null);
    } catch (e) {
      setError(e.message || 'Could not save — try again');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full h-28 rounded-sm border border-border bg-background p-2 text-xs font-mono"
        placeholder="One match per line: Round, MatchSlot, WinnerPosition, Score, OutcomeType"
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null); }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handlePreview} disabled={!text.trim() || busy}>
          Preview
        </Button>
        {preview && preview.length > 0 && (
          <Button size="sm" onClick={handleApply} disabled={busy}>
            {busy ? 'Applying…' : `Apply Results (${preview.length} matches)`}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleReject} disabled={busy}>
          Reject upload
        </Button>
      </div>
      {parseErrors.length > 0 && (
        <div className="text-xs text-destructive space-y-0.5">{parseErrors.map((e, i) => <div key={i}>{e}</div>)}</div>
      )}
      {preview && preview.length > 0 && (
        <div className="border border-border rounded-sm overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <th className="p-1.5 text-left">Round</th>
                <th className="p-1.5 text-left">Slot</th>
                <th className="p-1.5 text-left">Winner Pos</th>
                <th className="p-1.5 text-left">Score</th>
                <th className="p-1.5 text-left">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-1.5">{r.round}</td>
                  <td className="p-1.5">{r.matchSlot}</td>
                  <td className="p-1.5">{r.winnerPosition}</td>
                  <td className="p-1.5">{r.score}</td>
                  <td className="p-1.5">{r.outcomeType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

function ResultsSheetReviewQueue() {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState({}); // uploadId -> { applied } | null (rejected)

  useEffect(() => {
    api.getPendingAitaResultsUploads().then(setUploads).catch(e => setError(e.message || 'Could not load the queue'));
  }, []);

  function handleResolved(uploadId, result) {
    setResolved(prev => ({ ...prev, [uploadId]: result || { rejected: true } }));
  }

  if (error) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>;
  if (uploads === null) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  if (uploads.length === 0) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Nothing waiting for review.</div>;

  return (
    <div className="space-y-3">
      {uploads.map(u => {
        const t = u.tournament;
        const result = resolved[u.id];
        return (
          <div key={u.id} className="rounded-sm border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold">{t?.name || 'Tournament'}</div>
              <div className="text-xs text-muted-foreground">Uploaded {timeAgo(u.uploadedAt)}</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4">
              <UploadPreview storagePath={u.storagePath} fetchUrl={api.getAitaResultsUploadFileUrl} />
              {result ? (
                <div className="text-sm text-muted-foreground">
                  {result.rejected ? 'Rejected.' : `Applied — ${result.applied} match${result.applied === 1 ? '' : 'es'} updated.`}
                </div>
              ) : (
                <ApplyResultsForm upload={u} onApplied={handleResolved} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// Organizer Claims — an organizer asking to run an AITA-listed tournament
// through the normal platform flow instead of it staying crowdsourced.
// Approving creates the real tournament_weeks row (see
// approveAitaOrganizerClaim in supabaseApi.js); rejecting just leaves the
// tournament open for another claim or the crowdsourced path.
// --------------------------------------------------------------------------
function OrganizerClaimsQueue() {
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [approved, setApproved] = useState({}); // claimId -> { week }

  function reload() {
    api.getPendingAitaOrganizerClaims().then(setClaims).catch(e => setError(e.message || 'Could not load the queue'));
  }

  useEffect(() => { reload(); }, []);

  async function handleApprove(claim) {
    setBusyId(claim.id);
    setError('');
    try {
      const result = await api.approveAitaOrganizerClaim(claim.id);
      setApproved(prev => ({ ...prev, [claim.id]: result }));
      setClaims(prev => prev.filter(c => c.id !== claim.id));
    } catch (e) {
      setError(e.message || 'Could not approve — try again');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(claim) {
    setBusyId(claim.id);
    setError('');
    try {
      await api.rejectAitaOrganizerClaim(claim.id);
      setClaims(prev => prev.filter(c => c.id !== claim.id));
    } catch (e) {
      setError(e.message || 'Could not reject — try again');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>;
  if (claims === null) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  if (claims.length === 0 && Object.keys(approved).length === 0) {
    return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Nothing waiting for review.</div>;
  }

  return (
    <div className="space-y-3">
      {claims.map(c => {
        const t = c.tournament;
        return (
          <div key={c.id} className="rounded-sm border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold">{t?.name || 'Tournament'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[t?.venue, t?.city].filter(Boolean).join(', ')}{t?.startDate && ` · ${t.startDate}`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Claimed by <span className="font-semibold text-foreground">{c.claimant?.displayName || 'Unknown organizer'}</span>
                {c.claimant?.clubName && ` · ${c.claimant.clubName}`}
                {c.claimant?.isVerified && ' · Verified'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={busyId === c.id} onClick={() => handleApprove(c)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleReject(c)}>
                Reject
              </Button>
            </div>
          </div>
        );
      })}
      {Object.entries(approved).map(([claimId, result]) => (
        <div key={claimId} className="rounded-sm border border-border bg-card p-4 text-sm">
          Approved —{' '}
          <Link to={`/tournaments/${result.week.id}`} className="text-accent-ink underline underline-offset-2">
            open {result.week.name} ↗
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function AitaAdminReviewPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('draws');

  if (user?.role !== 'super_admin') {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          This page is restricted to platform admins.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Admin</div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">AITA Upload Review</h1>
      </div>

      <div className="inline-flex flex-wrap gap-1 border border-border rounded-sm p-1 bg-card">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold ${tab === t.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'draws' && <DrawSheetReviewQueue />}
      {tab === 'results' && <ResultsSheetReviewQueue />}
      {tab === 'claims' && <OrganizerClaimsQueue />}
    </div>
  );
}
