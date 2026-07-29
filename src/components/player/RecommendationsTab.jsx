import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { aggregateStrokeBreakdown, strokeWinRates } from '../../lib/segmentAnalytics';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { seedCountForDraw, roundDepth, ROUND_ORDER, estimateExpectedPoints } from '../../utils/aitaGradeRules';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';
import { Card } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// This player's own historically-typical furthest round reached in this
// segment (median depth across real completed matches from
// useSegmentMatchSchedule) — feeds estimateExpectedPoints below. Real data
// only: returns null (caller omits the points figure) when there's nothing
// to go on yet.
function historicalRound(recentMatches) {
  const depths = recentMatches.map(m => roundDepth(m.round)).filter(d => d >= 0).sort((a, b) => a - b);
  if (depths.length === 0) return null;
  return ROUND_ORDER[depths[Math.floor(depths.length / 2)]];
}

// Placeholder library — there is no real coach-assigned drill linkage yet.
// Shown only when this player has a real active coach link, with generic
// content tied to what's actually true (stroke that needs work) rather than
// fabricated drill names sourced from nowhere.
function placeholderDrills(stroke) {
  const s = (stroke || 'Groundstroke').toLowerCase();
  return [
    { name: `${stroke || 'Groundstroke'} consistency reps`, meta: 'Ask your coach to assign' },
    { name: `${s.includes('serve') ? 'Second-serve' : 'Break-point'} pressure drills`, meta: 'Ask your coach to assign' },
  ];
}

// Rule-based (explicitly v1, not ML) recommendations — cross-references the
// segment's real ranking goal with its weakest tracked stroke and its recent
// tournament-entry pace. "Suggested entries" expected-points uses the real
// AITA ranking-points-by-round table priced at this player's own
// historically-typical furthest round reached in this segment.
export default function RecommendationsTab({ circuit, playerId }) {
  const [goals, setGoals] = useState(null);
  const [matches, setMatches] = useState(null);
  const [entries, setEntries] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [coachLink, setCoachLink] = useState(null);
  const [error, setError] = useState('');
  const schedule = useSegmentMatchSchedule(playerId, circuit);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.getRankingGoals(playerId, circuit.category, circuit.subcategory),
      api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory),
      api.getMyEntries(playerId),
      api.listAitaTournaments({ ageGroup: circuit.subcategory.replace('-', ''), dateFrom: today }),
      api.getCoachLinks(playerId),
    ]).then(([g, m, e, cal, links]) => {
      if (cancelled) return;
      setGoals(g); setMatches(m); setEntries(e); setCalendar(cal);
      setCoachLink((links || []).find(l => l.status === 'active' && l.playerId === playerId) || null);
    }).catch(err => { if (!cancelled) { setError(err.message || 'Could not load recommendations'); setGoals([]); setMatches([]); setEntries([]); setCalendar([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');
  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);

  const weakestStroke = useMemo(() => {
    if (tracked.length === 0) return null;
    const rates = strokeWinRates(aggregateStrokeBreakdown(tracked)).filter(r => r.winRate !== null);
    if (rates.length === 0) return null;
    return rates.reduce((worst, r) => (r.winRate < worst.winRate ? r : worst));
  }, [tracked]);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter(e => {
      if (!e.event) return false;
      const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
      return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
    });
  }, [entries, circuit]);

  const recentEntries90d = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return segmentEntries.filter(e => (e.event.week?.startDate || '') >= cutoffIso).length;
  }, [segmentEntries]);

  const suggestedEntries = useMemo(() => {
    if (!calendar) return [];
    const myRank = circuit.latest.rank;
    const enteredKey = new Set(segmentEntries.map(e => `${(e.event.week?.name || '').toLowerCase()}|${e.event.week?.startDate}`));
    const round = historicalRound(schedule.recent);
    return calendar
      .filter(t => {
        const seg = normalizeEventSegment(t.category, t.ageGroup);
        if (!seg || seg.category !== circuit.category || seg.subcategory !== circuit.subcategory) return false;
        return !enteredKey.has(`${(t.name || '').toLowerCase()}|${t.startDate}`);
      })
      .slice(0, 4)
      .map(t => {
        const seeds = t.drawSize ? seedCountForDraw(t.drawSize) : null;
        const likelySeeded = seeds && myRank && myRank <= seeds;
        const expected = estimateExpectedPoints({ grade: t.grade, historicalRound: round });
        return {
          id: t.id, name: t.name, meta: `${formatDate(t.startDate)} · ${t.city || ''} · ${t.grade || ''}${t.drawSize ? ` · ${t.drawSize} draw` : ''}`,
          seedLabel: likelySeeded ? `Likely seeded (top ${seeds})` : (seeds ? 'Unseeded range' : null),
          expected,
        };
      });
  }, [calendar, circuit, segmentEntries, schedule.recent]);

  if (goals === null) return <div className="text-sm text-muted-foreground">Loading recommendations…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  const rankGap = activeGoal?.targetRank ? circuit.latest.rank - activeGoal.targetRank : null;

  return (
    <div className="space-y-4">
      {!activeGoal && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          Set a ranking goal in the Overview tab to get gap-to-goal recommendations for {circuit.category} {circuit.subcategory}.
        </div>
      )}

      {activeGoal && rankGap !== null && (
        <Card className="p-4 border-l-4 border-primary">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Gap to goal</div>
          <div className="text-sm mt-1">
            {rankGap > 0
              ? <>You need to climb <span className="font-bold text-primary">{rankGap} ranking places</span> to reach top {activeGoal.targetRank} in {circuit.category} {circuit.subcategory}.</>
              : <>You're already at or ahead of your top {activeGoal.targetRank} target for {circuit.category} {circuit.subcategory}.</>}
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-primary/10 text-primary border-transparent">Entry strategy</Badge>
          <span className="text-xs font-bold text-muted-foreground">Priority 1</span>
        </div>
        <div className="font-bold text-sm">Events you haven't entered yet in this segment</div>
        <div className="text-xs text-muted-foreground mt-1">
          Expected points = your historically-typical furthest round in {circuit.category} {circuit.subcategory}, priced at that round for each event's actual grade.
        </div>
        {suggestedEntries.length === 0 && (
          <div className="mt-4 text-sm text-muted-foreground">No upcoming {circuit.category} {circuit.subcategory} events found on the AITA calendar right now.</div>
        )}
        {suggestedEntries.length > 0 && (
          <div className="mt-4 space-y-2">
            {suggestedEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/50">
                <div className="flex-1 min-w-40">
                  <div className="text-sm font-semibold">{e.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{e.meta}</div>
                </div>
                {e.seedLabel && <Badge variant="secondary">{e.seedLabel}</Badge>}
                <div className="text-right shrink-0 min-w-16">
                  <div className="font-display font-extrabold text-base text-primary">{e.expected != null ? `~${e.expected}` : '—'}</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">Expected pts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {weakestStroke && (
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-blue-400/10 text-blue-400 border-transparent">Training focus</Badge>
            <span className="text-xs font-bold text-muted-foreground">Priority 2</span>
          </div>
          <div className="font-bold text-sm">{weakestStroke.stroke} is your weakest tracked shot</div>
          <div className="text-xs text-muted-foreground mt-1">
            {weakestStroke.winRate}% win rate across {weakestStroke.total} tracked points this segment — log some {weakestStroke.stroke.toLowerCase()} drills in the Training tab and see if it moves.
          </div>
          {coachLink && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">From your coach's library</div>
              <div className="flex flex-wrap gap-2">
                {placeholderDrills(weakestStroke.stroke).map(d => (
                  <div key={d.name} className="rounded-sm border border-border bg-secondary/50 p-2.5">
                    <div className="text-sm font-semibold">{d.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{d.meta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">Tournament pace</Badge>
          <span className="text-xs font-bold text-muted-foreground">Priority 3</span>
        </div>
        <div className="font-bold text-sm">{recentEntries90d} {circuit.category} {circuit.subcategory} entr{recentEntries90d === 1 ? 'y' : 'ies'} in the last 90 days</div>
        <div className="text-xs text-muted-foreground mt-1">
          {recentEntries90d === 0
            ? 'No recent entries in this segment — ranking points only come from tournaments you actually enter, so consider signing up for one.'
            : 'Keep entering regularly — rankings in this segment only reflect the events you actually play.'}
        </div>
      </Card>

      {!weakestStroke && tracked.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          Track a few matches in this segment to unlock training-focus recommendations.
        </div>
      )}
    </div>
  );
}
