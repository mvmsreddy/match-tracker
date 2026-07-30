import { useState } from 'react';
import { Card } from '@/components/primitives/card';
import {
  Trophy, Award, Zap, Flame, Shield, Target, Star, Crown,
  Dumbbell, Sparkles, TrendingUp, Lock, Share2,
} from 'lucide-react';
import ShareBadgeModal from './ShareBadgeModal';

const ICONS = {
  trophy: Trophy,
  award: Award,
  zap: Zap,
  flame: Flame,
  shield: Shield,
  target: Target,
  star: Star,
  crown: Crown,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  'trending-up': TrendingUp,
};

function isNew(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 48 * 3600 * 1000;
}

/**
 * AchievementsReel — a horizontally scrollable row of unlocked badges with
 * greyed-out "next up" locked tiles. Gives the player a running trophy
 * cabinet + a hint at what to chase next.
 */
export default function AchievementsReel({ achievements, playerName }) {
  const [shareBadge, setShareBadge] = useState(null);
  if (!achievements) return null;
  const { unlocked, locked, unlockedCount, totalCount } = achievements;

  // Sort unlocked by newest first, take latest 8; then show up to 4 locked as next-up
  const recentUnlocked = [...unlocked].sort((a, b) => (b.unlockedAt || '').localeCompare(a.unlockedAt || '')).slice(0, 8);
  const nextUp = locked.slice(0, 4);

  return (
    <Card className="p-5 sm:p-6 shadow-sm" data-testid="achievements-reel">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Trophy Cabinet</div>
          <div className="text-sm font-bold mt-0.5">
            {unlockedCount} of {totalCount} unlocked
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(unlockedCount / totalCount) * 100}%` }} />
          </div>
          <span className="text-xs font-bold">{Math.round((unlockedCount / totalCount) * 100)}%</span>
        </div>
      </div>

      {unlockedCount === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Log your first match to earn your first badge.
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto flex gap-2.5 pb-2 snap-x snap-mandatory scrollbar-thin">
          {recentUnlocked.map(a => {
            const Icon = ICONS[a.icon] || Trophy;
            const badgeNew = isNew(a.unlockedAt);
            return (
              <button
                key={a.id}
                onClick={() => setShareBadge(a)}
                className="relative snap-start shrink-0 w-24 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/60 transition-all active:scale-[0.97] group"
                data-testid={`ach-${a.id}`}
                title={`${a.desc} — tap to share`}
              >
                {badgeNew && (
                  <div className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black uppercase tracking-wider">
                    New
                  </div>
                )}
                <div className="relative w-10 h-10 mx-auto rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-amber-500" strokeWidth={2.2} />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Share2 className="w-2.5 h-2.5" strokeWidth={3} />
                  </div>
                </div>
                <div className="text-[11px] font-bold text-center mt-2 leading-tight text-foreground">
                  {a.title}
                </div>
              </button>
            );
          })}

          {/* Locked "next up" tiles */}
          {nextUp.map(a => {
            const Icon = ICONS[a.icon] || Trophy;
            return (
              <div
                key={a.id}
                className="snap-start shrink-0 w-24 p-3 rounded-xl border border-border bg-muted/40"
                data-testid={`ach-locked-${a.id}`}
                title={a.desc}
              >
                <div className="w-10 h-10 mx-auto rounded-full bg-muted border-2 border-border flex items-center justify-center">
                  <Lock className="w-4 h-4 text-muted-foreground" strokeWidth={2.2} />
                </div>
                <div className="text-[11px] font-semibold text-center mt-2 leading-tight text-muted-foreground">
                  {a.title}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {shareBadge && (
        <ShareBadgeModal
          badge={shareBadge}
          playerName={playerName}
          onClose={() => setShareBadge(null)}
        />
      )}
    </Card>
  );
}
