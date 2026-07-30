import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Activity, Dumbbell, Apple, X, ArrowRight, Trophy, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
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
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-sm font-bold">{t.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Recent5Strip — last 5 sessions in a compact row (score + result icon + date)
 */
export function Recent5Strip({ matches, onSelect }) {
  const items = (matches || []).slice(0, 5);
  if (items.length === 0) return null;
  return (
    <Card className="p-4 sm:p-5 shadow-sm" data-testid="recent-5-strip">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Recent</div>
          <div className="text-sm font-bold mt-0.5">Last {items.length} sessions</div>
        </div>
      </div>
      <div className="space-y-2">
        {items.map(m => {
          const isWin = m.winner === 'self';
          const isLoss = m.winner === 'opp';
          const isPractice = m.sessionType === 'practice';
          return (
            <div
              key={m.id}
              onClick={() => onSelect && onSelect(m)}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              data-testid={`recent-item-${m.id}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isWin ? 'bg-primary/15 text-primary' : isLoss ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
              }`}>
                {isWin ? 'W' : isLoss ? 'L' : isPractice ? 'PR' : '–'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">vs {m.oppName}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {m.date} {m.tournament ? `· ${m.tournament}` : ''}
                </div>
              </div>
              <div className={`text-sm font-bold shrink-0 ${isWin ? 'text-primary' : isLoss ? 'text-destructive' : ''}`}>
                {m.scoreSummary || '—'}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * DigestPreviewCard — in-app preview of "what the weekly digest email would say"
 * Computed client-side from matches, so no backend needed.
 */
export function DigestPreviewCard({ matches, streak, activeGoal }) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const week = (matches || []).filter(m => (m.date || '') >= cutoffIso && m.sessionType !== 'practice');
  const wins = week.filter(m => m.winner === 'self').length;
  const losses = week.filter(m => m.winner === 'opp').length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : null;
  const practices = (matches || []).filter(m => (m.date || '') >= cutoffIso && m.sessionType === 'practice').length;

  return (
    <Card className="p-4 sm:p-5 shadow-sm border-l-4 border-l-chart-3" data-testid="digest-preview">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Weekly Digest</div>
          <div className="text-sm font-bold mt-0.5">Your week at a glance</div>
        </div>
        <div className="text-[10px] text-muted-foreground uppercase font-bold">Preview</div>
      </div>

      {total === 0 && practices === 0 ? (
        <div className="text-xs text-muted-foreground">No sessions this week yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Matches</div>
            <div className="font-display font-extrabold text-xl tracking-tighter mt-0.5">{total}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">W - L</div>
            <div className="font-display font-extrabold text-xl tracking-tighter mt-0.5">
              <span className="text-primary">{wins}</span>-<span className="text-destructive">{losses}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Win Rate</div>
            <div className="font-display font-extrabold text-xl tracking-tighter mt-0.5">
              {winRate !== null ? `${winRate}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Practices</div>
            <div className="font-display font-extrabold text-xl tracking-tighter mt-0.5">{practices}</div>
          </div>
        </div>
      )}

      {streak?.current > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          🔥 Streak: <b className="text-foreground">{streak.current} days</b>{streak.best > streak.current ? ` · best ${streak.best}` : ''}
        </div>
      )}
      {activeGoal && (
        <div className="mt-1 text-xs text-muted-foreground">
          🎯 Working toward: <b className="text-foreground">Rank #{activeGoal.targetRank}</b>
        </div>
      )}
    </Card>
  );
}
