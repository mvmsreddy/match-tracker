import { Card } from '@/components/primitives/card';
import { Swords, Trophy, TrendingUp, TrendingDown } from 'lucide-react';

function opponentName(m) {
  const opp = m.mineSide === 'entry1' ? m.entry2 : m.entry1;
  if (!opp) return 'TBD';
  if (opp.isBye) return 'BYE';
  return opp.familyName + (opp.firstName ? `, ${opp.firstName}` : '');
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase().replace(/[,\s]+/g, ' ');
}

/**
 * H2HRivalryCard — a spotlight card that appears when today's or the next
 * upcoming opponent is someone the player has faced before. Shows the
 * head-to-head record, most recent result, dominance bar, and a quick
 * tactical hint. Only renders if there's ≥1 prior match against the opponent.
 */
export default function H2HRivalryCard({ upcomingMatches = [], history = [] }) {
  const next = upcomingMatches.find(m => opponentName(m) && opponentName(m) !== 'BYE');
  if (!next) return null;

  const oppKey = normalizeName(opponentName(next));
  const priorMatches = history
    .filter(m => m.sessionType !== 'practice' && m.oppName)
    .filter(m => normalizeName(m.oppName) === oppKey);

  if (priorMatches.length === 0) return null;

  const wins = priorMatches.filter(m => m.winner === 'self').length;
  const losses = priorMatches.filter(m => m.winner === 'opp').length;
  const total = wins + losses;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  const dominant = wins > losses;
  const even = wins === losses;

  const last = priorMatches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const lastWon = last?.winner === 'self';

  const hint = dominant
    ? "You've owned this matchup. Trust your patterns — start aggressive."
    : even
    ? 'This one is a coin flip. First to break serve usually wins these.'
    : 'You know this player. Change one thing tactically — surprise them.';

  return (
    <Card
      className="p-5 sm:p-6 shadow-sm relative overflow-hidden border-l-4 border-l-amber-400"
      data-testid="h2h-rivalry-card"
      style={{ background: 'linear-gradient(120deg, rgba(245,158,11,0.05) 0%, transparent 60%)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
          <Swords className="w-5 h-5 text-amber-500" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] uppercase tracking-[0.2em] font-bold text-amber-500">Rivalry Alert</div>
          <div className="text-sm font-bold mt-0.5 truncate">
            You've faced {opponentName(next)} before
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {total} prior meeting{total === 1 ? '' : 's'} · last {last?.date || ''}
            {last && (
              <span className={`ml-1.5 font-bold ${lastWon ? 'text-accent-ink' : 'text-destructive'}`}>
                ({lastWon ? 'W' : 'L'})
              </span>
            )}
          </div>

          {/* Record */}
          <div className="mt-3 flex items-baseline gap-3">
            <div className="font-display font-extrabold text-2xl tracking-tighter">
              <span className="text-accent-ink">{wins}</span>
              <span className="text-muted-foreground mx-1.5 text-lg">-</span>
              <span className="text-destructive">{losses}</span>
            </div>
            <div className={`inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              dominant ? 'bg-primary/10 text-accent-ink' : even ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive'
            }`}>
              {dominant ? <TrendingUp className="w-3 h-3" /> : even ? <Trophy className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {dominant ? 'Leading' : even ? 'Even' : 'Trailing'} · {winPct}%
            </div>
          </div>

          {/* Dominance bar */}
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden flex">
            {wins > 0 && <div className="bg-primary" style={{ width: `${(wins / total) * 100}%` }} />}
            {losses > 0 && <div className="bg-destructive" style={{ width: `${(losses / total) * 100}%` }} />}
          </div>

          {/* Tactical hint */}
          <div className="mt-3 text-xs italic leading-relaxed text-foreground/80">
            "{hint}"
          </div>
        </div>
      </div>
    </Card>
  );
}
