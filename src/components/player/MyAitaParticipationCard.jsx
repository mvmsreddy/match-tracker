import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useMyTournaments } from '../../hooks/useMyTournaments';
import { PLAYER_TOURNAMENT_STATUS } from '../../utils/tournamentStatus';
import PlayerParticipationCard from './PlayerParticipationCard';

const UPLOAD_STATUS_LABEL = {
  pending_review: 'Uploaded — waiting for admin review',
  confirmed: 'Confirmed — draw is being processed',
  parsed: 'Parsed — awaiting publish',
  confirmed_wrong: "That upload didn't match this tournament — try again below",
};

// Lets a player upload the draw-sheet photo/PDF for one declared tournament
// and shows the status of their own most recent upload.
export function DrawSheetUploader({ aitaTournamentId, ctaLabel }) {
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
          {busy ? 'Uploading…' : (latest ? 'Try a different upload' : (ctaLabel || 'Upload draw sheet'))}
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

// Dashboard summary — uses the same unified hook as PlayerTournamentsPage,
// filtered to tracking / pending-entry rows that need attention today.
export default function MyAitaParticipationCard({ isOwnDashboard }) {
  const { user } = useAuth();
  const { items, loading } = useMyTournaments(isOwnDashboard ? user?.id : null);

  if (!isOwnDashboard) return null;

  const attention = items.filter(item =>
    item.status === PLAYER_TOURNAMENT_STATUS.TRACKING
    || item.status === PLAYER_TOURNAMENT_STATUS.PENDING_ENTRY
  );

  if (loading || attention.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40 flex items-center justify-between gap-2">
        <span>My Tournaments</span>
        <Link to="/tournaments" className="normal-case font-semibold text-accent-ink hover:underline">View all →</Link>
      </div>
      <div className="divide-y divide-border">
        {attention.slice(0, 4).map(item => (
          <div key={item.key} className="p-0">
            <PlayerParticipationCard item={item} compact isOwnDashboard />
          </div>
        ))}
      </div>
    </div>
  );
}
