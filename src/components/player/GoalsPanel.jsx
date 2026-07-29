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
      <div className="border border-dashed border-border rounded-sm p-6 text-center">
        <div className="font-bold text-sm">No ranking goal set for {circuit.category} {circuit.subcategory} yet</div>
        {error && <div className="text-destructive text-xs mt-2">{error}</div>}
        {isOwnDashboard && <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>Set a goal</Button>}
      </div>
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
    <Card className="p-4 sm:p-6 border-l-4 border-primary">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex-1 min-w-60">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ranking goal</div>
          <div className="font-display font-extrabold text-xl tracking-tighter mt-1">
            {activeGoal.targetRank ? `Top ${activeGoal.targetRank}` : `${activeGoal.targetPoints} points`}
            {activeGoal.targetDate ? ` by ${formatDate(activeGoal.targetDate)}` : ''}
          </div>
          {paceNote && <div className="text-sm text-muted-foreground mt-1">{paceNote.charAt(0) + paceNote.slice(1).toLowerCase()}.</div>}
          {isOwnDashboard && <Button size="sm" variant="outline" className="mt-3" onClick={() => handleAbandon(activeGoal.id)}>Abandon goal</Button>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Current rank</div>
            <div className="font-display font-extrabold text-lg">{latest.rank}</div>
          </div>
          {activeGoal.targetRank && (
            <div>
              <div className="text-xs text-muted-foreground">Target rank</div>
              <div className="font-display font-extrabold text-lg text-primary">{activeGoal.targetRank}</div>
            </div>
          )}
          {pointsNeeded != null && (
            <div>
              <div className="text-xs text-muted-foreground">Points needed</div>
              <div className="font-display font-extrabold text-lg">{pointsNeeded}</div>
            </div>
          )}
          {monthsLeft != null && (
            <div>
              <div className="text-xs text-muted-foreground">Months left</div>
              <div className="font-display font-extrabold text-lg text-destructive">{monthsLeft}</div>
            </div>
          )}
        </div>
      </div>
      {rankProgress !== null && (
        <div className="mt-6">
          <div className="relative h-2.5 rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-primary" style={{ width: `${rankProgress}%` }} />
            {paceMarkPct != null && (
              <div className="absolute top-0 h-full w-0.5 bg-foreground" style={{ left: `${paceMarkPct}%` }} />
            )}
          </div>
          {paceNote && (
            <div className={`text-xs mt-2 ${paceNote.includes('BEHIND') ? 'text-destructive' : 'text-muted-foreground'}`}>{paceNote}</div>
          )}
        </div>
      )}
    </Card>
  );
}
