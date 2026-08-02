import { Card } from '@/components/primitives/card';

// Head-to-Head insight — groups matches by opponent, computes W-L per
// opponent from real tracked results (no fabricated hint text). Used to live
// inline in ComparePage; moved here so MyMatchesTab can mount it too.
export default function H2HInsight({ matches }) {
  const matchOnly = (matches || []).filter(m => m.sessionType !== 'practice' && m.oppName);
  const byOpp = matchOnly.reduce((acc, m) => {
    const key = m.oppName.trim().toLowerCase();
    if (!acc[key]) acc[key] = { name: m.oppName, matches: [], wins: 0, losses: 0 };
    acc[key].matches.push(m);
    if (m.winner === 'self') acc[key].wins++;
    else if (m.winner === 'opp') acc[key].losses++;
    return acc;
  }, {});
  const rivals = Object.values(byOpp)
    .filter(r => r.matches.length >= 2)
    .sort((a, b) => (b.matches.length - a.matches.length) || (b.wins - a.wins));

  if (rivals.length === 0) return null;

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="h2h-insight">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Head-to-Head</div>
          <div className="text-sm font-bold mt-0.5">Your rivalries · {rivals.length} opponent{rivals.length === 1 ? '' : 's'} played 2+ times</div>
        </div>
      </div>
      <div className="space-y-2">
        {rivals.slice(0, 5).map(r => {
          const total = r.wins + r.losses;
          const dominant = r.wins > r.losses;
          const even = r.wins === r.losses;
          return (
            <div
              key={r.name}
              className="p-3 rounded-lg border border-border bg-card"
              data-testid={`h2h-rival-${r.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.matches.length} match{r.matches.length === 1 ? '' : 'es'} played</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">
                    <span className="text-accent-ink">{r.wins}</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span className="text-destructive">{r.losses}</span>
                  </div>
                  <div className={`text-[12px] font-bold uppercase tracking-wider ${dominant ? 'text-accent-ink' : even ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {dominant ? 'Leading' : even ? 'Even' : 'Trailing'}
                  </div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                {r.wins > 0 && (
                  <div className="bg-primary transition-all" style={{ width: `${(r.wins / total) * 100}%` }} />
                )}
                {r.losses > 0 && (
                  <div className="bg-destructive transition-all" style={{ width: `${(r.losses / total) * 100}%` }} />
                )}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5">
                Last: {r.matches[0].scoreSummary || '—'} ({r.matches[0].winner === 'self' ? 'W' : r.matches[0].winner === 'opp' ? 'L' : '—'}) · {r.matches[0].date || 'unknown date'}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
