import { Card } from '@/components/primitives/card';
import { Trophy, Medal, Target, Flame } from 'lucide-react';

const ICONS = {
  trophy: Trophy,
  medal: Medal,
  target: Target,
  flame: Flame,
};

/**
 * NextMilestoneCard — one line ("X wins to hit 25") that turns cold ranking
 * data into a concrete near-term goal, with a slim progress bar. Sits on the
 * Dashboard so the player always has a "why open the app" hook.
 */
export default function NextMilestoneCard({ milestone }) {
  if (!milestone) return null;
  const { headline, sub, icon, progress } = milestone;
  const Icon = ICONS[icon] || Target;
  const pct = Math.max(0, Math.min(1, progress || 0)) * 100;

  return (
    <Card
      className="p-4 sm:p-5 shadow-sm relative overflow-hidden"
      data-testid="next-milestone"
      style={{ background: 'linear-gradient(120deg, rgba(245,158,11,0.06) 0%, transparent 55%)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-amber-500" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Next milestone</div>
          <div className="text-sm font-bold mt-0.5 leading-snug">{headline}</div>
          <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-amber-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </Card>
  );
}
