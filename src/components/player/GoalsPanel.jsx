import { useEffect, useState } from 'react';
import * as api from '../../api';
import { computeGoalPace, computeRankProgress } from '../../lib/segments';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Real ranking-goal tracking for one segment. Progress is computed from the
// segment's actual current rank/points (circuit.latest) against the stored
// target — no fabricated pace numbers. A player can have at most one *active*
// goal per segment shown here.
export default function GoalsPanel({ circuit, playerId, isOwnDashboard = true }) {
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ targetRank: '', targetPoints: '', targetDate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGoals(null);
    api.getRankingGoals(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setGoals(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load goals'); setGoals([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');

  async function handleSave() {
    setSaving(true);
    try {
      const created = await api.createRankingGoal(playerId, {
        category: circuit.category,
        subcategory: circuit.subcategory,
        targetRank: form.targetRank ? Number(form.targetRank) : null,
        targetPoints: form.targetPoints ? Number(form.targetPoints) : null,
        targetDate: form.targetDate || null,
      });
      setGoals(prev => [created, ...(prev || [])]);
      setEditing(false);
      setForm({ targetRank: '', targetPoints: '', targetDate: '' });
    } catch (e) {
      setError(e.message || 'Could not save goal');
    } finally {
      setSaving(false);
    }
  }

  async function handleAbandon(goalId) {
    try {
      const updated = await api.updateRankingGoal(goalId, { status: 'abandoned' });
      setGoals(prev => prev.map(g => (g.id === updated.id ? updated : g)));
    } catch (e) {
      setError(e.message || 'Could not update goal');
    }
  }

  if (goals === null) return <div className="text-sm text-muted-foreground">Loading goal…</div>;

  if (!activeGoal && !editing) {
    return (
      <Card className="border-2 border-dashed border-border p-6 text-center hover:border-primary transition-colors">
        <div className="text-3xl mb-2">🎯</div>
        <div className="font-bold text-sm">No ranking goal set for {circuit.category} {circuit.subcategory} yet</div>
        <div className="text-xs text-muted-foreground mt-1">Set a goal to track your progress</div>
        {error && <div className="text-destructive text-xs mt-2">{error}</div>}
        {isOwnDashboard && <Button size="sm" className="mt-4" onClick={() => setEditing(true)}>Set a goal</Button>}
      </Card>
    );
  }

  if (editing && isOwnDashboard) {
    return (
      <Card className="p-4 space-y-3">
        <div className="font-bold text-sm">New goal for {circuit.category} {circuit.subcategory}</div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Target rank
            <Input type="number" value={form.targetRank} onChange={e => setForm(f => ({ ...f, targetRank: e.target.value }))} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Target points
            <Input type="number" value={form.targetPoints} onChange={e => setForm(f => ({ ...f, targetPoints: e.target.value }))} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Target date
            <Input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} className="w-40" />
          </label>
        </div>
        {error && <div className="text-destructive text-xs">{error}</div>}
        <div className="flex gap-2">
          <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save goal'}</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </Card>
    );
  }

  const { latest } = circuit;
  const startRank = circuit.points[0]?.rank;
  const rankProgress = activeGoal.targetRank ? computeRankProgress(startRank, latest.rank, activeGoal.targetRank) : null;

  // Pace note comes from the shared computeGoalPace so this hero card never
  // disagrees with the topbar/Progress Tracker verdict for the same goal.
  const goalPace = computeGoalPace(circuit, activeGoal);
  const paceNote = goalPace?.note ?? null;
  let paceMarkPct = null;
  if (goalPace?.metric === 'rank' && rankProgress != null && activeGoal.targetDate) {
    const startMs = new Date(circuit.points[0].date).getTime();
    const endMs = new Date(activeGoal.targetDate).getTime();
    if (endMs > startMs) paceMarkPct = Math.max(0, Math.min(100, Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100)));
  }

  const monthsLeft = activeGoal.targetDate
    ? Math.max(0, Math.round((new Date(activeGoal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : null;
  const pointsNeeded = activeGoal.targetPoints ? Math.max(0, activeGoal.targetPoints - latest.totalPoints) : null;

  return (
    <Card className="p-4 sm:p-6 border-l-4 border-l-primary bg-primary/5 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎯</span>
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ranking goal</div>
          </div>
          <div className="font-display font-extrabold text-lg sm:text-xl tracking-tighter mt-1">
            {activeGoal.targetRank ? `Top ${activeGoal.targetRank}` : `${activeGoal.targetPoints} points`}
            {activeGoal.targetDate ? ` by ${formatDate(activeGoal.targetDate)}` : ''}
          </div>
          {paceNote && <div className="text-sm text-muted-foreground mt-1">{paceNote.charAt(0) + paceNote.slice(1).toLowerCase()}.</div>}
          {isOwnDashboard && <Button size="sm" variant="outline" className="mt-3" onClick={() => handleAbandon(activeGoal.id)}>Abandon goal</Button>}
        </div>
        <div className="grid grid-cols-2 gap-3 w-full sm:w-auto sm:flex-shrink-0">
          <div className="text-center sm:text-left p-3 rounded-lg bg-muted/50">
            <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Current</div>
            <div className="font-display font-extrabold text-xl sm:text-2xl mt-0.5">#{latest.rank}</div>
          </div>
          {activeGoal.targetRank && (
            <div className="text-center sm:text-left p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-[12px] uppercase tracking-wider font-bold text-primary">Target</div>
              <div className="font-display font-extrabold text-xl sm:text-2xl text-primary mt-0.5">#{activeGoal.targetRank}</div>
            </div>
          )}
          {pointsNeeded != null && (
            <div className="text-center sm:text-left p-3 rounded-lg bg-muted/50">
              <div className="text-[12px] uppercase tracking-wider font-bold text-muted-foreground">Points needed</div>
              <div className="font-display font-extrabold text-xl sm:text-2xl mt-0.5">{pointsNeeded}</div>
            </div>
          )}
          {monthsLeft != null && (
            <div className="text-center sm:text-left p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="text-[12px] uppercase tracking-wider font-bold text-destructive">Months left</div>
              <div className="font-display font-extrabold text-xl sm:text-2xl text-destructive mt-0.5">{monthsLeft}</div>
            </div>
          )}
        </div>
      </div>
      {rankProgress !== null && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground font-semibold uppercase tracking-wider">Progress</span>
            <span className="font-bold text-primary">{rankProgress}%</span>
          </div>
          <div className="relative h-3 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-700" 
              style={{ width: `${rankProgress}%` }} 
            />
            {paceMarkPct != null && (
              <div 
                className="absolute top-0 h-full w-0.5 bg-foreground shadow-sm" 
                style={{ left: `${paceMarkPct}%` }} 
                title="Expected pace"
              />
            )}
          </div>
          {paceNote && (
            <div className={`text-xs mt-2 font-semibold ${paceNote.includes('BEHIND') ? 'text-destructive' : 'text-muted-foreground'}`}>{paceNote}</div>
          )}
        </div>
      )}
    </Card>
  );
}
