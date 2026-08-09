import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayerActivity } from '../../hooks/usePlayerActivity';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '../../lib/utils';

export default function ActivityGoalPanel({
  playerId,
  isOwnDashboard = true,
  rankBehindPace = false,
  profileComplete = true,
}) {
  const { loading, stats, goal, saveGoal, error } = usePlayerActivity(playerId, { rankBehindPace, profileComplete });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ monthlyTarget: '', minimumMatches: '' });
  const [saving, setSaving] = useState(false);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading match activity…</div>;
  }

  const { pace, streakWeeks, readiness } = stats;
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  async function handleSave() {
    setSaving(true);
    try {
      await saveGoal({
        monthlyTarget: Number(form.monthlyTarget) || goal.monthlyTarget,
        minimumMatches: Number(form.minimumMatches) || goal.minimumMatches,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3" data-testid="activity-goal-panel">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Match activity</div>
          <h2 className="font-display font-extrabold text-lg tracking-tight">{monthLabel} targets</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Court readiness</div>
            <div className="font-display font-extrabold text-xl text-accent-ink">{readiness}%</div>
          </div>
          {isOwnDashboard && !editing && (
            <Button size="sm" variant="outline" onClick={() => {
              setForm({ monthlyTarget: String(goal.monthlyTarget), minimumMatches: String(goal.minimumMatches) });
              setEditing(true);
            }}>
              Edit targets
            </Button>
          )}
        </div>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {editing ? (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold">
              Monthly target
              <Input type="number" min={1} max={60} value={form.monthlyTarget} onChange={(e) => setForm((f) => ({ ...f, monthlyTarget: e.target.value }))} className="mt-1" />
            </label>
            <label className="text-xs font-semibold">
              Minimum matches
              <Input type="number" min={1} max={30} value={form.minimumMatches} onChange={(e) => setForm((f) => ({ ...f, minimumMatches: e.target.value }))} className="mt-1" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold">{pace.actual} / {pace.monthlyTarget} matches</span>
              <span className={cn('font-bold text-xs', pace.behindPace ? 'text-destructive' : 'text-accent-ink')}>
                {pace.progressPct}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', pace.behindPace ? 'bg-destructive/80' : 'bg-primary')}
                style={{ width: `${pace.progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className={pace.minimumMet ? 'text-accent-ink font-semibold' : 'text-destructive font-semibold'}>
                Min {pace.minimumMatches}: {pace.minimumMet ? '✓ reached' : `${pace.minimumMatches - pace.actual} to go`}
              </span>
              {pace.behindPace && pace.daysLeft > 0 && (
                <span className="text-destructive font-semibold">Behind pace — need ~{Math.max(0, pace.expectedByNow - pace.actual)} more soon</span>
              )}
              {streakWeeks >= 2 && (
                <span className="text-accent-ink font-semibold">{streakWeeks} week active streak</span>
              )}
            </div>
          </div>

          {isOwnDashboard && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/track">Log a match</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/tournaments">Find events</Link>
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
