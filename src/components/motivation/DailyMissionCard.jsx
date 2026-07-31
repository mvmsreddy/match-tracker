import { useState } from 'react';
import { Card } from '@/components/primitives/card';
import { Target, Check, Flame, ArrowRight } from 'lucide-react';
import { completeDailyMission } from '../../lib/motivation';

/**
 * DailyMissionCard — one tap-able micro-challenge that rotates daily.
 * Completing it grows a mission streak (independent of the training-day streak).
 * Deliberately small commitment so a player can always tick it in a minute.
 */
export default function DailyMissionCard({ mission, missionStreak, userId, onComplete }) {
  const [local, setLocal] = useState(mission);
  if (!local) return null;

  const done = local.completed;

  function handleComplete() {
    const updated = completeDailyMission(userId);
    setLocal(updated);
    onComplete?.();
  }

  return (
    <Card
      className={`p-4 sm:p-5 shadow-sm border-l-4 ${done ? 'border-l-primary bg-primary/5' : 'border-l-amber-400'}`}
      data-testid="daily-mission"
    >
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-primary text-primary-foreground' : 'bg-amber-500/15 text-amber-500'}`}>
          {done ? <Check className="w-5 h-5" strokeWidth={2.6} /> : <Target className="w-5 h-5" strokeWidth={2.2} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-[12px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              Daily Mission
            </div>
            {missionStreak > 0 && (
              <div className="inline-flex items-center gap-0.5 text-[12px] font-bold text-amber-500" data-testid="mission-streak">
                <Flame className="w-3 h-3" strokeWidth={2.5} />
                {missionStreak}d
              </div>
            )}
          </div>
          <div className="text-sm font-bold leading-snug">{local.title}</div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{local.desc}</div>

          {!done ? (
            <button
              onClick={handleComplete}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 active:scale-[0.97] transition-all"
              data-testid="mission-complete-btn"
            >
              Mark done <span className="opacity-90">+{local.xp} XP</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary">
              <Check className="w-3.5 h-3.5" />
              Nailed it — come back tomorrow for a new mission.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
