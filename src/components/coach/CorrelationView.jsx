import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { computeDrillCorrelation } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';
import { Card } from '@/components/primitives/card';

function verdict(rate) {
  if (rate >= 60) return { label: 'Working', cls: 'text-primary', barCls: 'bg-primary' };
  if (rate >= 40) return { label: 'Modest gain', cls: 'text-blue-400', barCls: 'bg-blue-400' };
  return { label: 'Not working', cls: 'text-destructive', barCls: 'bg-destructive' };
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Progress correlation — real, from src/lib/coachAnalytics.js's
// computeDrillCorrelation: each card is one completed assignment (its block
// has actually run its full duration), comparing each assigned player's
// last 4 tracked matches before the block against their first 4 after it.
export default function CorrelationView() {
  const { user } = useAuth();
  const [correlation, setCorrelation] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    computeDrillCorrelation(user.id)
      .then(data => { if (!cancelled) setCorrelation(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not compute correlation'); setCorrelation([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  if (correlation === null) return <div className="text-sm text-muted-foreground">Comparing before/after match data for completed drill blocks…</div>;
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>;

  if (correlation.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-sm p-6 text-center">
        <div className="font-bold text-sm">No completed drill blocks yet</div>
        <div className="text-xs text-muted-foreground mt-2">
          Assign a routine from a Skill Group, and once its block runs its full duration with tracked matches on both
          sides, real before/after results will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground max-w-prose">
        Each block compares the skill metric in each assigned player's last 4 tracked matches before the block with
        their first 4 tracked matches after it. Success rate is the share of assigned players who improved by more
        than three points.
      </div>

      {correlation.map(c => {
        const v = verdict(c.successRate);
        const maxVal = Math.max(c.avgBefore, c.avgAfter, 1);
        return (
          <Card key={c.assignmentId} className={`p-4 sm:p-6 border-l-4 ${v.barCls.replace('bg-', 'border-')}`}>
            <div className="flex flex-wrap gap-4 items-start">
              <div className="flex-1 min-w-56">
                <div className={`text-xs font-bold uppercase tracking-wider ${v.cls}`}>{v.label}</div>
                <div className="font-display font-extrabold text-lg tracking-tighter mt-2">
                  {c.drillTitle} &rarr; {SKILL_LABELS[c.skillKey] || c.skillKey}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {c.playersWithData} of {c.playersAssigned} assigned players with data &middot; {c.frequencyPerWeek}&times;/week &middot; {c.durationWeeks}-week block &middot; started {formatDate(c.startDate)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground whitespace-nowrap">Success rate</div>
                <div className={`font-display font-extrabold text-3xl tracking-tighter mt-2 ${v.cls}`}>{c.successRate}%</div>
              </div>
            </div>

            <div className="space-y-3 mt-5">
              <div className="grid grid-cols-[124px_1fr_60px] gap-3 items-center">
                <div className="text-xs text-muted-foreground">4 matches before</div>
                <div className="h-2 rounded-sm bg-muted"><div className="h-full rounded-sm bg-muted-foreground" style={{ width: `${(c.avgBefore / maxVal) * 100}%` }} /></div>
                <div className="text-right text-sm font-bold text-muted-foreground">{c.avgBefore}%</div>
              </div>
              <div className="grid grid-cols-[124px_1fr_60px] gap-3 items-center">
                <div className="text-xs text-muted-foreground">4 matches after</div>
                <div className="h-2 rounded-sm bg-muted"><div className={`h-full rounded-sm ${v.barCls}`} style={{ width: `${(c.avgAfter / maxVal) * 100}%` }} /></div>
                <div className={`text-right text-sm font-bold ${v.cls}`}>{c.avgAfter}%</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
