import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Activity, Dumbbell, Apple, X, ArrowRight, Sparkles } from 'lucide-react';
import { reminderDismissedToday, dismissReminderToday } from '@/lib/localStore';

/**
 * LogTodayReminder — courtesy banner after 6PM if no session logged today.
 * Dismissable once per day, persisted in sessionStorage.
 */
export function LogTodayReminder({ loggedToday, reminderHour = 18 }) {
  const [dismissed, setDismissed] = useState(() => reminderDismissedToday());
  const navigate = useNavigate();

  if (dismissed || loggedToday) return null;
  const now = new Date();
  if (now.getHours() < reminderHour) return null;

  return (
    <Card
      className="p-4 sm:p-5 border-l-4 border-l-accent bg-accent/10 shadow-sm"
      data-testid="log-today-reminder"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-accent-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">You haven't logged today's session yet</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            A quick tap keeps your streak alive — log a match, drill, or meal.
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button size="sm" onClick={() => navigate('/track')} data-testid="reminder-log-btn">
              Log now
            </Button>
            <button
              onClick={() => { dismissReminderToday(); setDismissed(true); }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1"
              data-testid="reminder-dismiss-btn"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={() => { dismissReminderToday(); setDismissed(true); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary shrink-0"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

/**
 * QuickAddGrid — 3 shortcut tiles (Match / Drill / Meal)
 */
export function QuickAddGrid() {
  const navigate = useNavigate();
  const tiles = [
    { id: 'match', label: 'Log Match', desc: 'Track a match', icon: Activity, to: '/track', color: 'primary' },
    { id: 'drill', label: 'Log Drill', desc: 'Add a training session', icon: Dumbbell, to: '/drills', color: 'chart-3' },
    { id: 'meal', label: 'Log Meal', desc: 'Nutrition + water', icon: Apple, to: '/nutrition', color: 'chart-4' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="quick-add-grid">
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => navigate(t.to)}
            className="text-left p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all group"
            data-testid={`quick-add-${t.id}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ background: `color-mix(in srgb, var(--color-${t.color}) 15%, transparent)` }}
              >
                <Icon className="w-5 h-5" style={{ color: `var(--color-${t.color})` }} />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-accent-ink transition-colors" />
            </div>
            <div className="text-sm font-bold">{t.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

