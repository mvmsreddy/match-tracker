import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeSkillGroups, computeGoalPaceSummary, computeDrillCorrelation } from '../../lib/coachAnalytics';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

export const SKILL_LABELS = {
  Forehand: 'Forehand', Backhand: 'Backhand', Serve: 'Serve', Volley: 'Volley', Smash: 'Smash',
  BreakPointConversion: 'Break-point conversion', SecondServe: 'Second-serve consistency',
};

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Skill Groups landing — every group here is computed live from
// src/lib/coachAnalytics.js's computeSkillGroups (real relative-threshold
// rule against each player's own season average), never a stored table.
// The "intervention needed" callout only appears when a real completed
// drill block actually underperformed.
export default function SkillGroupsView({ roster, onOpenGroup, onGoLibrary, onGoCorrelation }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [pace, setPace] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [hoursThisMonth, setHoursThisMonth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roster) return;
    let cancelled = false;
    Promise.all([
      computeSkillGroups(roster),
      computeGoalPaceSummary(roster),
      computeDrillCorrelation(user.id),
      api.getTrainingSessionsLoggedByCoach(user.id, monthStartIso()),
    ]).then(([g, p, corr, sessions]) => {
      if (cancelled) return;
      setGroups(g); setPace(p); setCorrelation(corr);
      setHoursThisMonth(Math.round(sessions.reduce((s, r) => s + (r.durationMinutes || 0), 0) / 60));
    }).catch(e => { if (!cancelled) { setError(e.message || 'Could not compute skill groups'); setGroups([]); } });
    return () => { cancelled = true; };
  }, [roster, user.id]);

  const worstCorrelation = useMemo(() => {
    if (!correlation || correlation.length === 0) return null;
    const worst = [...correlation].sort((a, b) => a.successRate - b.successRate)[0];
    return worst.successRate < 50 ? worst : null;
  }, [correlation]);

  if (groups === null) return <div className="text-sm text-muted-foreground">Computing skill groups from tracked matches…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Linked players</div>
          <div className="font-display font-extrabold text-xl">{roster.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Skill gaps flagged</div>
          <div className="font-display font-extrabold text-xl">{groups.length}</div>
          {groups.length > 0 && <div className="text-xs text-destructive mt-1">{groups.reduce((s, g) => s + g.members.length, 0)} player-gaps total</div>}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">On pace for goal</div>
          <div className="font-display font-extrabold text-xl">{pace ? pace.onPaceCount : '—'}</div>
          {pace && <div className="text-xs text-muted-foreground mt-1">of {pace.totalWithGoals}</div>}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Drill hours logged</div>
          <div className="font-display font-extrabold text-xl">{hoursThisMonth ?? '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">this month</div>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground max-w-prose">
        Groups are derived automatically from match analytics — a player joins a group when a tracked metric sits more
        than eight points below their own season average across at least four matches. Open a group below to assign a routine.
      </div>

      {groups.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center">
          <div className="font-bold text-sm">No skill gaps found yet</div>
          <div className="text-xs text-muted-foreground mt-2">This needs at least 4 tracked matches per player per segment. Ask players to use "Track this match" from their Tournaments tab.</div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((g) => {
            const key = `${g.category}|${g.subcategory}|${g.skillKey}`;
            const avgRecent = Math.round(g.members.reduce((s, m) => s + m.recentAvg, 0) / g.members.length);
            const avgSeason = Math.round(g.members.reduce((s, m) => s + m.seasonAvg, 0) / g.members.length);
            return (
              <Card key={key} className="p-4 border-t-4 border-t-blue-400 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-400">{g.category} {g.subcategory}</div>
                    <div className="font-display font-extrabold text-lg tracking-tighter mt-2">{SKILL_LABELS[g.skillKey] || g.skillKey}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-extrabold text-2xl">{g.members.length}</div>
                    <div className="text-[12px] text-muted-foreground mt-1 whitespace-nowrap">Players</div>
                  </div>
                </div>

                <div className="flex items-baseline gap-2 text-xs">
                  <div className="font-bold text-blue-400 text-base">{avgRecent}%</div>
                  <div className="text-muted-foreground">group avg vs</div>
                  <div className="font-semibold text-sm">{avgSeason}%</div>
                  <div className="text-muted-foreground">own season avg</div>
                </div>
                <div className="relative h-2.5 rounded-sm bg-muted">
                  <div className="h-full rounded-sm bg-blue-400" style={{ width: `${avgRecent}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${avgSeason}%` }} />
                </div>

                <div className="space-y-1.5">
                  {g.members.slice(0, 3).map(m => (
                    <div key={m.playerId} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        <span className="font-semibold truncate">{m.name}</span>
                      </div>
                      <div className="text-muted-foreground shrink-0">#{m.rank}</div>
                      <div className="font-bold text-blue-400 shrink-0">{m.recentAvg}%</div>
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="mt-auto" onClick={() => onOpenGroup(key)}>
                  Open group and assign drills
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {worstCorrelation && (
        <Card className="p-4 sm:p-6 border-destructive/40">
          <div className="text-xs font-bold uppercase tracking-wider text-destructive">Intervention needed</div>
          <div className="font-display font-extrabold text-lg tracking-tighter mt-2 max-w-prose">
            {worstCorrelation.playersWithData} player{worstCorrelation.playersWithData === 1 ? '' : 's'} assigned "{worstCorrelation.drillTitle}" and it hasn't moved {SKILL_LABELS[worstCorrelation.skillKey] || worstCorrelation.skillKey} — {worstCorrelation.successRate}% success rate, the lowest measured block right now.
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button variant="destructive" onClick={onGoCorrelation}>See the correlation data</Button>
            <Button variant="outline" onClick={onGoLibrary}>Browse alternatives</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
