import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ORGANIZER_STAGES, computeOrganizerStage, pickEventForAction } from '../../utils/organizerTournamentStage';
import { Button } from '@/components/primitives/button';

const STEPS = ['setup', 'entries', 'draw', 'matches'];

export default function OrganizerProgressStepper({ week, events, interestedCount = 0, onAction }) {
  const stageInfo = computeOrganizerStage(week, events);
  const currentOrder = ORGANIZER_STAGES[stageInfo.stage]?.order ?? 1;

  function stepState(stepKey) {
    const order = ORGANIZER_STAGES[stepKey]?.order ?? 0;
    if (stageInfo.stage === 'complete') return 'done';
    if (order < currentOrder) return 'done';
    if (order === currentOrder || (stageInfo.stage === 'matches' && stepKey === 'matches')) return 'current';
    return 'upcoming';
  }

  function handlePrimaryCta() {
    if (!stageInfo.cta) return;
    const action = stageInfo.cta.action;
    if (onAction) {
      onAction(action, week, events);
      return;
    }
  }

  const targetEvent = pickEventForAction(events, stageInfo.cta?.action);
  const ctaHref = targetEvent
    ? `/tournaments/${week.id}/events/${targetEvent.id}`
    : `/tournaments/${week.id}`;

  return (
    <div className="rounded-sm border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((key, idx) => {
          const state = stepState(key);
          return (
            <div key={key} className="flex items-center gap-2">
              {idx > 0 && <span className="text-muted-foreground text-xs">→</span>}
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold',
                state === 'done' && 'bg-primary/10 text-accent-ink',
                state === 'current' && 'bg-foreground text-background',
                state === 'upcoming' && 'bg-muted text-muted-foreground',
              )}>
                {state === 'done' ? '✓' : ORGANIZER_STAGES[key].order}
                {' '}{ORGANIZER_STAGES[key].label}
              </span>
            </div>
          );
        })}
        {stageInfo.stage === 'complete' && (
          <span className="inline-flex items-center rounded-sm bg-secondary px-2.5 py-1 text-xs font-semibold">Complete</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{stageInfo.summary}</p>
        {stageInfo.cta && onAction && (
          <Button size="sm" onClick={handlePrimaryCta}>{stageInfo.cta.label}</Button>
        )}
        {stageInfo.cta && !onAction && (
          <Link to={ctaHref}>
            <Button size="sm">{stageInfo.cta.label}</Button>
          </Link>
        )}
      </div>

      {week?.source === 'aita_claimed' && interestedCount > 0 && stageInfo.stage !== 'complete' && (
        <div className="rounded-sm border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <strong>{interestedCount} player{interestedCount !== 1 ? 's' : ''}</strong> already marked themselves as participating before you claimed this event.{' '}
          {targetEvent ? (
            <Link to={`/tournaments/${week.id}/events/${targetEvent.id}`} className="text-accent-ink font-semibold hover:underline">
              Review interested players →
            </Link>
          ) : (
            'Accept them under each event\'s Entries tab.'
          )}
        </div>
      )}
    </div>
  );
}
