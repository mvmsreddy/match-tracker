import { useState, useEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Card } from '@/components/primitives/card';
import { Droplet, Plus, RotateCcw } from 'lucide-react';
import { todayWaterMl, addWaterMl, resetTodayWater, weeklyWaterAvg } from '@/lib/localStore';

/**
 * MacroDonut — daily macros donut (Carbs · Protein · Fats)
 * `totals` = { calories, proteinG, carbsG, fatsG }
 */
export function MacroDonut({ totals, goal }) {
  const carbsKcal = (totals?.carbsG || 0) * 4;
  const proteinKcal = (totals?.proteinG || 0) * 4;
  const fatsKcal = (totals?.fatsG || 0) * 9;
  const totalMacroKcal = carbsKcal + proteinKcal + fatsKcal;

  const data = [
    { name: 'Carbs', value: carbsKcal, grams: totals?.carbsG || 0, color: 'hsl(var(--color-primary))' },
    { name: 'Protein', value: proteinKcal, grams: totals?.proteinG || 0, color: 'hsl(var(--color-chart-3))' },
    { name: 'Fats', value: fatsKcal, grams: totals?.fatsG || 0, color: 'hsl(var(--color-chart-4))' },
  ].filter(d => d.value > 0);

  const empty = data.length === 0;

  return (
    <Card className="p-4 sm:p-6 shadow-sm">
      <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Today's Macros</div>
      <div className="text-sm font-bold mt-0.5 mb-3">Fuel breakdown</div>

      {empty ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <div className="text-xs text-muted-foreground">Log a meal to see your macro split</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div className="relative">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${Math.round(v)} kcal`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display font-extrabold text-2xl tracking-tighter">{totals?.calories || 0}</div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">kcal</div>
            </div>
          </div>
          <div className="space-y-2">
            {data.map(d => {
              const pct = totalMacroKcal ? Math.round((d.value / totalMacroKcal) * 100) : 0;
              return (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold">{d.name}</span>
                      <span className="text-xs text-muted-foreground">{d.grams}g · {pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * WaterTracker — tap-chips to log water quickly (250 / 500 / 750 ml)
 */
export function WaterTracker({ userId, goalMl }) {
  const [current, setCurrent] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => { setCurrent(todayWaterMl(userId)); }, [userId]);

  function add(ml) {
    const next = addWaterMl(userId, ml);
    setCurrent(next);
    setPulse(true);
    setTimeout(() => setPulse(false), 400);
  }
  function reset() {
    if (!window.confirm("Reset today's water total?")) return;
    resetTodayWater(userId);
    setCurrent(0);
  }

  const goal = goalMl || 2500;
  const pct = Math.min(100, Math.round((current / goal) * 100));

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="water-tracker">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Hydration</div>
          <div className="text-sm font-bold mt-0.5">Tap to log water</div>
        </div>
        <div className="text-right">
          <div className={`font-display font-extrabold text-2xl tracking-tighter transition-colors ${pulse ? 'text-primary' : ''}`}>
            {current}
            <span className="text-sm text-muted-foreground ml-1">/ {goal} ml</span>
          </div>
          <div className="text-xs font-semibold text-primary mt-0.5">{pct}%</div>
        </div>
      </div>

      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 flex items-center justify-end pr-1"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[250, 500, 750].map(ml => (
          <button
            key={ml}
            onClick={() => add(ml)}
            className="flex flex-col items-center gap-1 py-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors active:scale-95"
            data-testid={`water-add-${ml}`}
          >
            <Droplet className="w-5 h-5 text-primary" fill="currentColor" />
            <span className="text-xs font-bold">+{ml}ml</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 text-xs">
        <button onClick={reset} className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 font-semibold">
          <RotateCcw className="w-3 h-3" /> Reset today
        </button>
        <span className="text-muted-foreground">7-day avg: <b className="text-foreground">{weeklyWaterAvg(userId).avg}ml</b></span>
      </div>
    </Card>
  );
}

/**
 * WeeklyAverageCard — 7-day average vs goals, single card
 */
export function WeeklyAverageCard({ logs, goals }) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const weekLogs = (logs || []).filter(l => (l.logDate || '') >= cutoffIso);
  const days = new Set(weekLogs.map(l => l.logDate));
  const totals = weekLogs.reduce((a, l) => ({
    calories: a.calories + (l.calories || 0),
    proteinG: a.proteinG + Number(l.proteinG || 0),
    hydrationMl: a.hydrationMl + (l.hydrationMl || 0),
  }), { calories: 0, proteinG: 0, hydrationMl: 0 });
  const nDays = Math.max(1, days.size);
  const avg = {
    calories: Math.round(totals.calories / nDays),
    proteinG: Math.round(totals.proteinG / nDays),
    hydrationMl: Math.round(totals.hydrationMl / nDays),
  };

  const cards = [
    { label: 'Calories', value: avg.calories, unit: 'kcal', goal: goals?.kcalGoal },
    { label: 'Protein', value: avg.proteinG, unit: 'g', goal: goals?.proteinGoalG },
    { label: 'Water', value: avg.hydrationMl, unit: 'ml', goal: goals?.waterGoalMl },
  ];

  return (
    <Card className="p-4 sm:p-6 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Weekly Average</div>
          <div className="text-sm font-bold mt-0.5">Last 7 days</div>
        </div>
        <div className="text-xs text-muted-foreground">{days.size}/7 days logged</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(c => {
          const pct = c.goal ? Math.min(100, Math.round((c.value / c.goal) * 100)) : null;
          const onTrack = pct !== null && pct >= 80;
          return (
            <div key={c.label} className="p-3 rounded-lg border border-border">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{c.label}</div>
              <div className="font-display font-extrabold text-lg tracking-tighter mt-1">
                {c.value}<span className="text-xs text-muted-foreground ml-0.5">{c.unit}</span>
              </div>
              {c.goal && (
                <div className={`text-[10px] font-semibold mt-1 ${onTrack ? 'text-primary' : 'text-muted-foreground'}`}>
                  {pct}% of {c.goal}{c.unit}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
