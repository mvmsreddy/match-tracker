import { Card } from '@/components/primitives/card';
import { Trophy, Dumbbell, Droplet } from 'lucide-react';

function Ring({ pct, color, size = 96, stroke = 10, Icon, doneLabel, goalLabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(1, Math.max(0, pct));
  const offset = circumference - clampedPct * circumference;
  const boosted = pct >= 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
          {boosted && (
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={color}
              strokeWidth={stroke - 6}
              strokeLinecap="round"
              opacity={0.35}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-6 h-6" style={{ color }} strokeWidth={2.2} />
        </div>
      </div>
      <div className="text-center">
        <div className="font-display font-extrabold text-base tracking-tighter leading-none" style={{ color: boosted ? color : 'inherit' }}>
          {doneLabel}<span className="text-muted-foreground font-semibold text-xs"> / {goalLabel}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * WeeklyGoalRings — three Apple-Watch-style rings on the Dashboard summarising
 * this week's activity: match sessions, practice/drill sessions, and daily
 * water intake. Close all three to keep your weekly streak alive.
 */
export default function WeeklyGoalRings({ rings }) {
  if (!rings) return null;
  const { match, practice, water } = rings;
  const allClosed = match.pct >= 1 && practice.pct >= 1 && water.pct >= 1;

  return (
    <Card className="p-5 sm:p-6 shadow-sm" data-testid="weekly-rings">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">This Week</div>
          <div className="text-sm font-bold mt-0.5">Goal rings · close all 3 to level up</div>
        </div>
        {allClosed && (
          <span className="rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
            Perfect Week
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <Ring
          pct={match.pct}
          color="var(--color-primary)"
          Icon={Trophy}
          doneLabel={match.done}
          goalLabel={match.goal}
        />
        <Ring
          pct={practice.pct}
          color="#f59e0b"
          Icon={Dumbbell}
          doneLabel={practice.done}
          goalLabel={practice.goal}
        />
        <Ring
          pct={water.pct}
          color="#3b82f6"
          Icon={Droplet}
          doneLabel={water.done + 'L'}
          goalLabel={water.goal + 'L / day'}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-center">
        <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Matches</div>
        <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Practice</div>
        <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Hydration (avg/day)</div>
      </div>
    </Card>
  );
}
