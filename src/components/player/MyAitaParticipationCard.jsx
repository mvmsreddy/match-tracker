import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { Badge } from '@/components/primitives/badge';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(`${iso}T23:59:59`).getTime() - Date.now()) / 86400000);
}

const UPLOAD_STATUS_LABEL = {
  pending_review: 'Uploaded — waiting for admin review',
  confirmed: 'Confirmed — draw is being processed',
  parsed: 'Parsed — awaiting publish',
  confirmed_wrong: "That upload didn't match this tournament — try again below",
};

// Lets a player upload the draw-sheet photo/PDF for one declared tournament
// and shows the status of their own most recent upload. Any of the players
// who declared interest can be the one who uploads it — this widget doesn't
// care who else has or hasn't.
function DrawSheetUploader({ aitaTournamentId }) {
  const [uploads, setUploads] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function reload() {
    return api.getMyAitaDrawUploads(aitaTournamentId)
      .then(setUploads)
      .catch(() => setUploads([]));
  }

  useEffect(() => { reload(); }, [aitaTournamentId]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadAitaDrawSheet(aitaTournamentId, file);
      await reload();
    } catch (err) {
      setError(err.message || 'Upload failed — try again');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (uploads === null) return null;

  const latest = uploads[0] || null;
  const canReupload = !latest || latest.status === 'confirmed_wrong';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" onClick={e => e.preventDefault()}>
      {latest && (
        <span className="text-muted-foreground">{UPLOAD_STATUS_LABEL[latest.status] || latest.status}</span>
      )}
      {canReupload && (
        <label className={`inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-2.5 py-1 font-semibold cursor-pointer hover:border-primary ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          {busy ? 'Uploading…' : (latest ? 'Try a different upload' : 'Upload draw sheet')}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>
      )}
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

// Player dashboard card for AITA-calendar tournaments the player has
// declared they're playing (phase 45). Independent of SegmentContext's
// circuit scoping — unlike TournamentsTab, this needs to show even for a
// player with no ranking history yet, since it's driven purely by their own
// "I'm Playing" declarations (src/components/AitaTournamentFactsheet.jsx).
// Renders nothing once a tournament is "live on the platform" — either a
// crowdsourced draw got published or an organizer claimed it (phase 46) —
// at that point it's a real tournament_week with real draw_entries, so
// TournamentsTab already covers it and showing it twice would be redundant.
export default function MyAitaParticipationCard({ isOwnDashboard }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!isOwnDashboard) { setRows([]); return; }
    let cancelled = false;
    api.getMyAitaParticipation()
      .then(data => { if (!cancelled) setRows(data.filter(r => !r.tournament?.linkedTournamentWeekId)); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [isOwnDashboard]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
        My AITA Tournaments
      </div>
      <div className="divide-y divide-border">
        {rows.map(r => {
          const t = r.tournament;
          if (!t) return null;
          const entryDays = daysUntil(t.entryDeadline);
          const withdrawalDays = daysUntil(t.withdrawalDeadline);
          return (
            <div key={r.id} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <Link to={`/aita-calendar/${t.id}`} className="flex-1 min-w-48 hover:underline">
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {[t.venue, t.city].filter(Boolean).join(', ')}
                    {t.startDate && ` · ${formatDate(t.startDate)}`}
                  </div>
                </Link>
                {entryDays != null && entryDays >= 0 && (
                  <Badge variant="secondary">Entries close in {entryDays}d</Badge>
                )}
                {withdrawalDays != null && withdrawalDays >= 0 && (
                  <Badge variant="secondary">Freeze deadline in {withdrawalDays}d</Badge>
                )}
              </div>
              <DrawSheetUploader aitaTournamentId={t.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
