import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/primitives/button';

const STORAGE_KEY = 'mt_organizer_checklist_dismissed';

function dismissedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function dismissWeek(weekId) {
  const ids = dismissedIds();
  ids.add(weekId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function shouldShowOnboardingChecklist(week) {
  if (!week?.id || week.source !== 'aita_claimed') return false;
  return !dismissedIds().has(week.id);
}

export default function OrganizerOnboardingChecklist({ week, events, interestedCount, onDismiss }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const firstEvent = events[0];
  const items = [
    {
      done: events.length > 0,
      label: `Review auto-created events (${events.length || 0})`,
      to: `/tournaments/${week.id}`,
    },
    {
      done: interestedCount === 0,
      label: interestedCount > 0
        ? `Accept ${interestedCount} interested player${interestedCount !== 1 ? 's' : ''}`
        : 'No pre-declared players to review',
      to: firstEvent ? `/tournaments/${week.id}/events/${firstEvent.id}` : `/tournaments/${week.id}`,
      skip: interestedCount === 0,
    },
    {
      done: false,
      label: 'Set entry fees / deadlines if needed',
      to: `/tournaments/${week.id}`,
    },
    {
      done: events.some(e => e.entriesOpen),
      label: 'Open entries to the public',
      to: `/tournaments/${week.id}`,
    },
    {
      done: events.some(e => e.status === 'draw_ready' || e.status === 'in_progress'),
      label: 'Publish draw when entries close',
      to: firstEvent ? `/tournaments/${week.id}/events/${firstEvent.id}` : `/tournaments/${week.id}`,
    },
  ].filter(item => !item.skip);

  function handleDismiss() {
    dismissWeek(week.id);
    setOpen(false);
    onDismiss?.();
  }

  return (
    <div className="rounded-sm border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">Your claim was approved — quick start</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {week.name} is live. Work through these steps to get players enrolled.
          </div>
        </div>
        <button type="button" onClick={handleDismiss} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Dismiss</button>
      </div>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span className={item.done ? 'text-accent-ink' : 'text-muted-foreground'}>{item.done ? '☑' : '☐'}</span>
            <Link to={item.to} className="hover:text-accent-ink hover:underline">{item.label}</Link>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-1">
        <Link to={`/tournaments/${week.id}`}>
          <Button size="sm">Go to tournament</Button>
        </Link>
        <Button size="sm" variant="outline" onClick={handleDismiss}>Got it</Button>
      </div>
    </div>
  );
}
