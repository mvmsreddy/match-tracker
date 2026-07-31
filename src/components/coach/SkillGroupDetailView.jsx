import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeSkillGroups } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/primitives/table';

const FREQ_OPTS = [1, 2, 3];
const DUR_OPTS = [4, 6, 8];

// One skill group's roster + a real "suggested routine" (the best-matching
// drill_library row for this skill_key) + a real assign flow that writes a
// drill_assignments row (computeDrillCorrelation reads it back once the
// block completes).
export default function SkillGroupDetailView({ groupKey, roster, onBack }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [drills, setDrills] = useState(null);
  const [error, setError] = useState('');
  const [unpicked, setUnpicked] = useState({});
  const [freq, setFreq] = useState(2);
  const [dur, setDur] = useState(4);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    if (!roster) return;
    let cancelled = false;
    Promise.all([computeSkillGroups(roster), api.getDrillLibrary()])
      .then(([g, d]) => { if (!cancelled) { setGroups(g); setDrills(d); } })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load group'); });
    return () => { cancelled = true; };
  }, [roster]);

  const group = useMemo(() => {
    if (!groups) return null;
    return groups.find(g => `${g.category}|${g.subcategory}|${g.skillKey}` === groupKey) || null;
  }, [groups, groupKey]);

  const routine = useMemo(() => {
    if (!drills || !group) return null;
    return drills.find(d => d.skillKey === group.skillKey) || null;
  }, [drills, group]);

  const picked = useMemo(() => (group ? group.members.filter(m => !unpicked[m.playerId]) : []), [group, unpicked]);

  async function handleAssign() {
    if (!group || !routine || picked.length === 0) return;
    setAssigning(true);
    try {
      await api.createDrillAssignment({
        coachId: user.id, drillId: routine.id, category: group.category, subcategory: group.subcategory,
        skillKey: group.skillKey, playerIds: picked.map(m => m.playerId), frequencyPerWeek: freq, durationWeeks: dur,
      });
      setAssigned(true);
    } catch (e) {
      setError(e.message || 'Could not assign routine');
    } finally {
      setAssigning(false);
    }
  }

  if (groups === null) return <div className="text-sm text-muted-foreground">Loading group…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;
  if (!group) return <div className="text-sm text-muted-foreground">Group not found — it may have resolved away as match data changed.</div>;

  return (
    <div className="space-y-4">
      <Button size="sm" variant="outline" className="w-fit" onClick={onBack}>&larr; All skill groups</Button>

      <Card className="p-4 sm:p-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Recent vs season</TableHead>
              <TableHead className="text-right">Recent</TableHead>
              <TableHead className="text-right">Season</TableHead>
              <TableHead className="text-right">Matches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.members.map(m => (
              <TableRow key={m.playerId}>
                <TableCell className="font-semibold">{m.name}</TableCell>
                <TableCell className="text-muted-foreground">#{m.rank}</TableCell>
                <TableCell>
                  <div className="relative h-2.5 rounded-sm bg-muted min-w-24">
                    <div className="h-full rounded-sm bg-destructive" style={{ width: `${m.recentAvg}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${m.seasonAvg}%` }} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-destructive">{m.recentAvg}%</TableCell>
                <TableCell className="text-right text-muted-foreground">{m.seasonAvg}%</TableCell>
                <TableCell className="text-right text-muted-foreground">{m.matchCount} tracked</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 sm:p-6 border-l-4 border-primary">
          {routine ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-primary">Suggested routine</div>
              <div className="font-display font-extrabold text-lg tracking-tighter mt-2">{routine.title}</div>
              <div className="text-sm text-muted-foreground mt-2">{routine.description}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                {routine.defaultVolume && (
                  <div className="rounded-sm bg-secondary/50 p-3">
                    <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Volume</div>
                    <div className="font-bold text-sm mt-1">{routine.defaultVolume}</div>
                  </div>
                )}
                {routine.defaultFrequencyPerWeek && (
                  <div className="rounded-sm bg-secondary/50 p-3">
                    <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Frequency</div>
                    <div className="font-bold text-sm mt-1">{routine.defaultFrequencyPerWeek}&times;/week</div>
                  </div>
                )}
                {routine.defaultDurationWeeks && (
                  <div className="rounded-sm bg-secondary/50 p-3">
                    <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Duration</div>
                    <div className="font-bold text-sm mt-1">{routine.defaultDurationWeeks} weeks</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No drill in your library targets {SKILL_LABELS[group.skillKey] || group.skillKey} yet — add one from Drill Library.</div>
          )}
        </Card>

        <Card className="p-4 sm:p-6 flex flex-col gap-4">
          <div className="font-bold text-sm">Assign to this group</div>

          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Players</div>
            <div className="flex flex-wrap gap-2">
              {group.members.map(m => {
                const on = !unpicked[m.playerId];
                return (
                  <button
                    key={m.playerId}
                    className={`px-3 py-1.5 rounded-sm text-xs font-semibold border ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                    onClick={() => setUnpicked(u => ({ ...u, [m.playerId]: on }))}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Frequency</div>
            <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1">
              {FREQ_OPTS.map(f => (
                <button key={f} className={`px-3 py-1.5 rounded-sm text-xs font-semibold ${freq === f ? 'bg-foreground text-background' : 'text-muted-foreground'}`} onClick={() => { setFreq(f); setAssigned(false); }}>{f}&times;/week</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Block length</div>
            <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1">
              {DUR_OPTS.map(d => (
                <button key={d} className={`px-3 py-1.5 rounded-sm text-xs font-semibold ${dur === d ? 'bg-foreground text-background' : 'text-muted-foreground'}`} onClick={() => { setDur(d); setAssigned(false); }}>{d} weeks</button>
              ))}
            </div>
          </div>

          <div className="rounded-sm bg-secondary/50 p-3 text-xs text-muted-foreground">
            {picked.length} of {group.members.length} players &middot; {freq}&times; per week for {dur} weeks &middot; {freq * dur} sessions each
          </div>

          {error && <div className="text-destructive text-xs">{error}</div>}

          <Button className="mt-auto" disabled={!routine || picked.length === 0 || assigning} onClick={handleAssign}>
            {assigned ? 'Assigned ✓' : (assigning ? 'Assigning…' : 'Assign routine')}
          </Button>
        </Card>
      </div>
    </div>
  );
}
