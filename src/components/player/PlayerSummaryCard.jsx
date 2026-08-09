import { Trophy, Target, TrendingUp } from 'lucide-react';
import { computePlayerCareerSummary } from '../../lib/playerDashboardDates';
import { Card } from '@/components/primitives/card';

export default function PlayerSummaryCard({ matches, tournamentItems }) {
  const stats = computePlayerCareerSummary(matches, tournamentItems);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="p-4">
        <Trophy className="w-4 h-4 text-muted-foreground mb-2" />
        <div className="font-display font-extrabold text-2xl tracking-tighter">{stats.tournaments}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-1">Tournaments</div>
      </Card>
      <Card className="p-4">
        <Target className="w-4 h-4 text-muted-foreground mb-2" />
        <div className="font-display font-extrabold text-2xl tracking-tighter">{stats.matchesTracked}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-1">Matches tracked</div>
      </Card>
      <Card className="p-4">
        <TrendingUp className="w-4 h-4 text-accent-ink mb-2" />
        <div className="font-display font-extrabold text-2xl tracking-tighter">{stats.wins}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-1">Wins</div>
      </Card>
      <Card className="p-4">
        <div className="font-display font-extrabold text-2xl tracking-tighter">{stats.winRate != null ? `${stats.winRate}%` : '—'}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-1">Win rate</div>
      </Card>
    </div>
  );
}
