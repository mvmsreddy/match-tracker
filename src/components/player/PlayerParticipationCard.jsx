import { Link } from 'react-router-dom';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { DrawSheetUploader } from './MyAitaParticipationCard';
import { PLAYER_TOURNAMENT_STATUS } from '../../utils/tournamentStatus';
import TournamentMatches from '../tournaments/TournamentMatches';
import { normalizeEventSegment } from '../../lib/governingBodies';

function formatMeta(parts) {
  return parts.filter(Boolean).join(' · ');
}

// Unified card for one row in "My Tournaments" — covers tracking-only interest,
// the post-claim pending-entry bridge, and real draw entries with match lists.
export default function PlayerParticipationCard({
  item,
  expanded = false,
  onToggle,
  trackedByEventMatch,
  onOpenMatch,
  isOwnDashboard = true,
  compact = false,
}) {
  const t = item.interest?.tournament;
  const badge = item.badge;

  const subtitle = formatMeta([
    item.week?.location || t?.venue,
    item.week?.city || t?.city,
    item.startDate,
  ]);

  const segmentLabel = t
    ? formatMeta([item.interest?.selectedAgeGroup || t.ageGroup, item.interest?.selectedCategory || t.category, t.grade])
    : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        {onToggle && (
          <button type="button" onClick={onToggle} className="text-muted-foreground shrink-0 mt-0.5">
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={item.linkTo} className="text-sm font-bold hover:text-accent-ink truncate">
              {item.name}
            </Link>
            <span className={`rounded-sm px-1.5 py-0.5 text-[0.68rem] font-semibold shrink-0 ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          {segmentLabel && !compact && <div className="text-xs text-muted-foreground">{segmentLabel}</div>}

          {item.showDrawUpload && t && (
            <DrawSheetUploader aitaTournamentId={t.id} ctaLabel={badge.ctaLabel} />
          )}

          {item.showEnterCta && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Organizer is running this event on the platform.</span>
              <Button asChild size="sm" variant="outline">
                <Link to={item.linkTo}>Enter event →</Link>
              </Button>
            </div>
          )}
        </div>

        {!compact && item.entries.length > 0 && (
          <Link to={item.linkTo} className="text-xs font-semibold text-accent-ink hover:underline shrink-0">
            Tournament page →
          </Link>
        )}
      </div>

      {expanded && item.entries.length > 0 && (
        <div className="px-3 pb-3 border-t border-border space-y-3">
          {item.entries.map(({ event, entry }) => {
            const circuit = normalizeEventSegment(event.category, event.ageGroup) || { category: event.category, subcategory: event.ageGroup };
            return (
              <div key={entry.id} className="pt-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{event.ageGroup} {event.category}</span>
                  {entry.entryStatus === 'placed' && (
                    <Badge variant="secondary">{entry.drawType === 'qualifying' ? 'Qualifying' : 'Main'}</Badge>
                  )}
                </div>
                {onOpenMatch && (
                  <TournamentMatches
                    entry={entry}
                    circuit={circuit}
                    trackedByEventMatch={trackedByEventMatch}
                    onOpenMatch={onOpenMatch}
                    isOwnDashboard={isOwnDashboard}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {item.status === PLAYER_TOURNAMENT_STATUS.PENDING_ENTRY && !item.showEnterCta && (
        <div className="px-3 pb-3 text-xs text-muted-foreground border-t border-border pt-2">
          Waiting for the organizer to add you or open entries.
        </div>
      )}
    </Card>
  );
}
