import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { cn } from '../../lib/utils';

export default function HostTournamentModal({ open, onClose, onCreateStandalone, onClaimAita }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-sm max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-extrabold tracking-tight">Host a Tournament</h2>
            <p className="text-sm text-muted-foreground mt-1">How is this event listed?</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-secondary shrink-0">✕</button>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => { onClose(); onClaimAita(); }}
            className={cn(
              'text-left rounded-sm border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors',
            )}
          >
            <div className="text-sm font-bold">I'm running an AITA-listed event</div>
            <div className="text-xs text-muted-foreground mt-1">
              Find it in the synced AITA calendar and claim it. Avoids duplicates and links players who already marked themselves as participating.
            </div>
            <div className="mt-3">
              <span className="text-xs font-semibold text-accent-ink">Recommended for official AITA tournaments →</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => { onClose(); onCreateStandalone(); }}
            className="text-left rounded-sm border border-dashed border-border p-4 hover:border-primary hover:bg-secondary/40 transition-colors"
          >
            <div className="text-sm font-bold">I'm hosting a non-AITA / private event</div>
            <div className="text-xs text-muted-foreground mt-1">
              Create a standalone tournament on the platform — club events, invitational meets, or anything not on the AITA calendar.
            </div>
          </button>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export function DuplicateAitaWarning({ matches, onClaimInstead, onContinueAnyway }) {
  if (!matches?.length) return null;

  return (
    <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-4 space-y-3">
      <div className="text-sm font-semibold text-destructive">This may already exist on the AITA calendar</div>
      <p className="text-xs text-muted-foreground">
        Claiming the existing listing keeps one record for players and avoids duplicate events.
      </p>
      <ul className="space-y-2">
        {matches.map(t => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{t.name}</div>
              <div className="text-xs text-muted-foreground">{[t.city, t.startDate].filter(Boolean).join(' · ')}</div>
            </div>
            <Link to={`/aita-calendar?mode=claim&highlight=${t.id}`}>
              <Button size="sm">Claim instead</Button>
            </Link>
          </li>
        ))}
      </ul>
      {onContinueAnyway && (
        <Button size="sm" variant="outline" className="text-muted-foreground" onClick={onContinueAnyway}>
          Create standalone anyway
        </Button>
      )}
    </div>
  );
}
