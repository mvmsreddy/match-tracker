import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { computeGoalPace } from '../../lib/segments';
import { countTournamentsBySegment, rankDeltaLabel } from '../../lib/segmentOverview';
import { countMatchesThisMonthBySegment } from '../../lib/activityGoals';
import { cn } from '../../lib/utils';
import { Badge } from '@/components/primitives/badge';
import { Card } from '@/components/primitives/card';

function formatPoints(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN');
}

export default function SegmentOverviewPanel({
  circuits,
  selectedKey,
  onSelectKey,
  playerId,
  nativeCircuitKey,
  myTournamentItems,
  allMatches,
  rankingGoals,
  aitaReg,
  isOwnDashboard = true,
}) {
  const [goals, setGoals] = useState(rankingGoals);
  const [peersByKey, setPeersByKey] = useState({});
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => {
    if (rankingGoals) {
      setGoals(rankingGoals);
      return;
    }
    if (!playerId) return;
    let cancelled = false;
    api.getRankingGoals(playerId)
      .then((g) => { if (!cancelled) setGoals(g); })
      .catch(() => { if (!cancelled) setGoals([]); });
    return () => { cancelled = true; };
  }, [playerId, rankingGoals]);

  const tournamentCounts = useMemo(
    () => countTournamentsBySegment(myTournamentItems),
    [myTournamentItems],
  );

  const goalsByKey = useMemo(() => {
    const map = new Map();
    for (const g of goals || []) {
      if (g.status !== 'active') continue;
      map.set(g.circuitKey || `${g.category}|${g.subcategory}`, g);
    }
    return map;
  }, [goals]);

  useEffect(() => {
    if (!expandedKey || !aitaReg) return;
    const circuit = circuits.find((c) => c.key === expandedKey);
    if (!circuit?.latest) return;
    let cancelled = false;
    api.getCloseInRankPeers(
      circuit.category,
      circuit.subcategory,
      circuit.latest.date,
      circuit.latest.rank,
      aitaReg,
    ).then((rows) => {
      if (cancelled) return;
      setPeersByKey((prev) => ({ ...prev, [expandedKey]: rows }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [expandedKey, circuits, aitaReg]);

  if (!circuits?.length) return null;

  return (
    <section className="space-y-3" data-testid="segment-overview-panel">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">My Rankings</div>
          <h2 className="font-display font-extrabold text-lg tracking-tight">All age groups at a glance</h2>
        </div>
        <div className="text-xs text-muted-foreground">Tap a card for detail view</div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
        {circuits.map((circuit) => {
          const isNative = nativeCircuitKey === circuit.key;
          const isSelected = selectedKey === circuit.key;
          const delta = rankDeltaLabel(circuit);
          const activeGoal = goalsByKey.get(circuit.key);
          const goalPace = activeGoal ? computeGoalPace(circuit, activeGoal) : null;
          const tournaments = tournamentCounts.get(circuit.key) || 0;
          const monthMatches = countMatchesThisMonthBySegment(allMatches, circuit.category, circuit.subcategory);
          const expanded = expandedKey === circuit.key;

          return (
            <Card
              key={circuit.key}
              className={cn(
                'min-w-[220px] max-w-[240px] snap-start shrink-0 p-4 cursor-pointer transition-all hover:shadow-md',
                isSelected ? 'ring-2 ring-primary border-primary/40' : 'border-border',
              )}
              onClick={() => {
                onSelectKey(circuit.key);
                setExpandedKey(expanded ? null : circuit.key);
              }}
              data-testid={`segment-card-${circuit.key}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-sm leading-tight">
                  {circuit.category} {circuit.subcategory}
                </div>
                {isNative && <Badge variant="secondary" className="text-[10px] shrink-0">Your age</Badge>}
              </div>

              <div className="font-display font-extrabold text-3xl tracking-tighter text-accent-ink">
                #{circuit.latest.rank}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatPoints(circuit.latest.totalPoints)} pts
                {delta && (
                  <span className={cn('ml-2 font-bold', delta.positive ? 'text-accent-ink' : delta.positive === false ? 'text-destructive' : '')}>
                    {delta.text}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                  <div className="text-muted-foreground uppercase tracking-wide font-bold">Tournaments</div>
                  <div className="font-bold text-sm">{tournaments}</div>
                </div>
                <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                  <div className="text-muted-foreground uppercase tracking-wide font-bold">Matches/mo</div>
                  <div className="font-bold text-sm">{monthMatches}</div>
                </div>
              </div>

              {goalPace?.behindPace && (
                <div className="mt-2 text-[11px] font-semibold text-destructive">⚠ Rank goal behind pace</div>
              )}

              {expanded && peersByKey[circuit.key]?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Near your rank</div>
                  {peersByKey[circuit.key].map((p) => (
                    <div key={`${p.rank}-${p.totalPoints}`} className={cn('flex justify-between text-[11px] font-mono', p.isPlayer && 'font-bold text-accent-ink bg-primary/10 rounded px-1')}>
                      <span>#{p.rank}{p.isPlayer ? ' · you' : ''}</span>
                      <span>{formatPoints(p.totalPoints)} pts</span>
                    </div>
                  ))}
                </div>
              )}

              {!isOwnDashboard && isSelected && (
                <div className="mt-2 text-[10px] text-muted-foreground">Viewing this segment below</div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
