import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';
import { cn } from '../../lib/utils';
import { computeOrganizerStage, stageBadgeClass, sourceBadge } from '../../utils/organizerTournamentStage';

function formatDateRange(start, end) {
  if (!start && !end) return '';
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

function eventLink(weekId, eventId) {
  return eventId
    ? `/tournaments/${weekId}/events/${eventId}`
    : `/tournaments/${weekId}`;
}

export default function OrganizerTournamentCard({ week, events = [], onAction, compact = false, showDelete, onDelete }) {
  const stageInfo = computeOrganizerStage(week, events);
  const badge = sourceBadge(week);
  const firstEvent = events[0];

  function handleCta() {
    if (!stageInfo.cta) return;
    if (onAction) {
      onAction(stageInfo.cta.action, week, events);
      return;
    }
  }

  const ctaHref = stageInfo.cta && !onAction
    ? (stageInfo.cta.action === 'add_event'
      ? `/tournaments/${week.id}`
      : eventLink(week.id, firstEvent?.id))
    : null;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary transition-all',
      compact ? 'p-3' : 'p-4',
    )}>
      <Link to={`/tournaments/${week.id}`} className="flex-1 min-w-0">
        <div className="text-sm sm:text-base font-bold truncate">{week.name}</div>
        {!compact && week.subtitle && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{week.subtitle}</div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold', stageBadgeClass(stageInfo.stage))}>
            {stageInfo.label}
          </span>
          {badge && (
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold', badge.className)}>
              {badge.label}
            </span>
          )}
          {week.eventCount != null && (
            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[0.7rem] font-semibold">
              {week.eventCount ?? events.length} event{(week.eventCount ?? events.length) !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {!compact && (
          <div className="text-xs text-muted-foreground mt-2">{stageInfo.summary}</div>
        )}
        {(week.startDate || week.city) && (
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
            {week.city && <span>{[week.city, week.stateAbbr].filter(Boolean).join(', ')}</span>}
            {(week.startDate || week.endDate) && <span>{formatDateRange(week.startDate, week.endDate)}</span>}
          </div>
        )}
      </Link>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {stageInfo.cta && onAction && (
          <Button size="sm" variant="outline" onClick={handleCta}>{stageInfo.cta.label}</Button>
        )}
        {stageInfo.cta && ctaHref && (
          <Link to={ctaHref}>
            <Button size="sm" variant="outline">{stageInfo.cta.label}</Button>
          </Link>
        )}
        {showDelete && onDelete && (
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(week.id)} title="Delete tournament">
            ✕
          </Button>
        )}
      </div>
    </div>
  );
}
