import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRetroactivePoints } from '../hooks/useRetroactivePoints';
import Wizard from './Wizard';
import * as api from '../api';
import '../styles/tracker-tailwind.css';

const TRACKING_MODES = [
  { value: 'basic', label: 'Basic' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

// Retroactive point-by-point entry (Phase 1, item 2) — adds shot-level
// detail to a match that was already saved (e.g. logged with just the final
// score courtside), independent of live tracking. Reuses the exact same
// Wizard.jsx point-entry UI live tracking uses, seeded from the match's
// existing points via useRetroactivePoints, and persists via
// api.updateMatchPoints on Save. Renders its own .tracker-shell wrapper
// (and imports tracker-tailwind.css directly) since this modal is opened
// from MatchDetailPage.jsx, which — unlike TrackerPage.jsx — doesn't
// otherwise load the Tracker's scoped Tailwind build.
export default function RetroactivePointEntryModal({ match, onClose, onSaved }) {
  const { user } = useAuth();
  const [trackingMode, setTrackingMode] = useState('expert');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const t = useRetroactivePoints(match);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateMatchPoints(user.id, match.id, t.points);
      onSaved(updated);
    } catch (e) {
      setError(e.message || 'Could not save points');
      setSaving(false);
    }
  }

  return (
    <div className="tracker-shell fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background text-foreground border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg font-extrabold tracking-tighter">Add point detail</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {match.selfName} vs {match.oppName} &middot; {t.addedCount} point{t.addedCount === 1 ? '' : 's'} added this session
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 p-4 border-b border-border">
          {TRACKING_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setTrackingMode(m.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                trackingMode === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Wizard
          nextServer={t.nextServer}
          onCommit={t.commitPoint}
          onUndo={t.undoLast}
          canUndo={t.canUndo}
          selfName={match.selfName || 'You'}
          oppName={match.oppName || 'Opponent'}
          onDelete={onClose}
          trackingMode={trackingMode}
        />

        {error && <div className="px-4 pb-2 text-sm text-destructive">{error}</div>}

        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-foreground hover:border-primary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || t.addedCount === 0}
            className="px-4 py-2 rounded-lg bg-primary text-background text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${t.addedCount} point${t.addedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
