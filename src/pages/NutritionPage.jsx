import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { MacroDonut, WaterTracker, WeeklyAverageCard } from '@/components/NutritionWidgets';
import {
  ComplianceHero, AiMealSuggester, PeriMatchFuelTimer,
  WeeklyReportCard, GiTriggerCard, WellnessQuickLog, DietitianChatCard,
} from '@/components/NutritionCoachingPanel';
import { Apple, Plus } from 'lucide-react';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'pre_match', label: 'Pre-match' },
  { value: 'post_match', label: 'Post-match' },
];

function todayIso() {
  // Use LOCAL date so "today" matches what the user sees, not UTC.
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function GoalBar({ label, value, goal, unit }) {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const hit = goal && value >= goal;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground">
          {value}{unit} {goal ? `/ ${goal}${unit}` : ''} {hit && <span className="text-accent-ink font-bold">✓</span>}
        </span>
      </div>
      <div className="h-2 rounded-sm bg-muted">
        <div className={`h-full rounded-sm ${hit ? 'bg-primary' : 'bg-primary/60'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Nutrition logging (Phase 2, PRD §2.1) — meal log form + "Today's targets"
// progress bars against user_profiles.kcal_goal/water_goal_ml/protein_goal_g.
export default function NutritionPage() {
  const { user, refreshProfile } = useAuth();
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    logDate: todayIso(), mealType: 'breakfast', foodItems: '',
    calories: '', proteinG: '', carbsG: '', fatsG: '', hydrationMl: '', notes: '',
  });
  const [goalForm, setGoalForm] = useState({
    kcalGoal: user.kcalGoal || '', waterGoalMl: user.waterGoalMl || '', proteinGoalG: user.proteinGoalG || '',
  });
  const [savingGoals, setSavingGoals] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    api.getNutritionLogs(user.id, cutoff.toISOString().slice(0, 10))
      .then(data => { if (!cancelled) setLogs(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load nutrition logs'); setLogs([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  const todayLogs = useMemo(() => (logs || []).filter(l => l.logDate === todayIso()), [logs]);
  const todayTotals = useMemo(() => todayLogs.reduce((acc, l) => ({
    calories: acc.calories + (l.calories || 0),
    proteinG: acc.proteinG + Number(l.proteinG || 0),
    carbsG: acc.carbsG + Number(l.carbsG || 0),
    fatsG: acc.fatsG + Number(l.fatsG || 0),
    hydrationMl: acc.hydrationMl + (l.hydrationMl || 0),
  }), { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, hydrationMl: 0 }), [todayLogs]);

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const created = await api.createNutritionLog(user.id, {
        logDate: form.logDate, mealType: form.mealType, foodItems: form.foodItems || null,
        calories: form.calories ? Number(form.calories) : null,
        proteinG: form.proteinG ? Number(form.proteinG) : null,
        carbsG: form.carbsG ? Number(form.carbsG) : null,
        fatsG: form.fatsG ? Number(form.fatsG) : null,
        hydrationMl: form.hydrationMl ? Number(form.hydrationMl) : null,
        notes: form.notes || null,
      });
      setLogs(prev => [created, ...(prev || [])]);
      setForm({ logDate: todayIso(), mealType: 'breakfast', foodItems: '', calories: '', proteinG: '', carbsG: '', fatsG: '', hydrationMl: '', notes: '' });
      setCreating(false);
    } catch (e) {
      setError(e.message || 'Could not save log');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this log?')) return;
    try {
      await api.deleteNutritionLog(id);
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      setError(e.message || 'Could not delete log');
    }
  }

  async function handleSaveGoals() {
    setSavingGoals(true);
    try {
      await api.updateNutritionGoals(user.id, {
        kcalGoal: goalForm.kcalGoal ? Number(goalForm.kcalGoal) : null,
        waterGoalMl: goalForm.waterGoalMl ? Number(goalForm.waterGoalMl) : null,
        proteinGoalG: goalForm.proteinGoalG ? Number(goalForm.proteinGoalG) : null,
      });
      await refreshProfile();
      setEditingGoals(false);
    } catch (e) {
      setError(e.message || 'Could not save goals');
    } finally {
      setSavingGoals(false);
    }
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto space-y-4">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
          <Apple className="w-3.5 h-3.5" />
          Nutrition Tracker
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter mt-1">Nutrition</h1>
        <div className="text-sm text-muted-foreground mt-0.5">Log meals, hydrate, track your daily targets</div>
      </div>

      {error && <div className="text-destructive text-sm">{error}</div>}

      {/* Compliance hero — day-type picker + color-coded compliance bars */}
      <ComplianceHero athleteId={user.id} logs={logs || []} />

      {/* AI Meal Suggester + Peri-Match Fuel Timer side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AiMealSuggester athleteId={user.id} />
        <PeriMatchFuelTimer athleteId={user.id} />
      </div>

      {/* Weekly report card + GI trigger + wellness log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeeklyReportCard athleteId={user.id} logs={logs || []} />
        <WellnessQuickLog athleteId={user.id} onLogged={() => api.getNutritionLogs(user.id).then(setLogs)} />
      </div>
      <GiTriggerCard logs={logs || []} />
      <DietitianChatCard athleteId={user.id} />

      {/* Today's macros + water tracker side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MacroDonut totals={todayTotals} goal={{ kcal: user.kcalGoal, protein: user.proteinGoalG }} />
        <WaterTracker userId={user.id} goalMl={user.waterGoalMl} />
      </div>

      {/* Weekly average */}
      {logs !== null && (
        <WeeklyAverageCard
          logs={logs}
          goals={{ kcalGoal: user.kcalGoal, waterGoalMl: user.waterGoalMl, proteinGoalG: user.proteinGoalG }}
        />
      )}

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Today's Targets</div>
          <button className="text-xs font-semibold text-accent-ink hover:underline" onClick={() => setEditingGoals(v => !v)}>
            {editingGoals ? 'Cancel' : 'Edit goals'}
          </button>
        </div>

        {editingGoals ? (
          <div className="flex flex-wrap gap-3 mt-3">
            <Field label="Calories goal">
              <Input type="number" value={goalForm.kcalGoal} onChange={e => setGoalForm(f => ({ ...f, kcalGoal: e.target.value }))} className="w-28" />
            </Field>
            <Field label="Water goal (ml)">
              <Input type="number" value={goalForm.waterGoalMl} onChange={e => setGoalForm(f => ({ ...f, waterGoalMl: e.target.value }))} className="w-28" />
            </Field>
            <Field label="Protein goal (g)">
              <Input type="number" value={goalForm.proteinGoalG} onChange={e => setGoalForm(f => ({ ...f, proteinGoalG: e.target.value }))} className="w-28" />
            </Field>
            <div className="flex items-end">
              <Button size="sm" onClick={handleSaveGoals} disabled={savingGoals}>{savingGoals ? 'Saving…' : 'Save goals'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            <GoalBar label="Calories" value={todayTotals.calories} goal={user.kcalGoal} unit=" kcal" />
            <GoalBar label="Water" value={todayTotals.hydrationMl} goal={user.waterGoalMl} unit=" ml" />
            <GoalBar label="Protein" value={todayTotals.proteinG} goal={user.proteinGoalG} unit="g" />
          </div>
        )}
      </Card>

      <Button size="sm" onClick={() => setCreating(v => !v)} data-testid="log-meal-toggle">{creating ? 'Cancel' : '+ Log a meal'}</Button>

      {creating && (
        <Card className="p-4 sm:p-6" data-testid="log-meal-form">
          <div className="flex flex-wrap gap-3">
            <Field label="Date">
              <Input type="date" value={form.logDate} onChange={e => setForm(f => ({ ...f, logDate: e.target.value }))} className="w-40" data-testid="meal-date" />
            </Field>
            <Field label="Meal">
              <select
                className="rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9"
                value={form.mealType}
                onChange={e => setForm(f => ({ ...f, mealType: e.target.value }))}
                data-testid="meal-type"
              >
                {MEAL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Food items">
              <Input value={form.foodItems} onChange={e => setForm(f => ({ ...f, foodItems: e.target.value }))} placeholder="e.g. Oatmeal, banana, eggs" data-testid="meal-food-items" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            <Field label="Calories"><Input type="number" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} className="w-24" data-testid="meal-calories" /></Field>
            <Field label="Protein (g)"><Input type="number" value={form.proteinG} onChange={e => setForm(f => ({ ...f, proteinG: e.target.value }))} className="w-24" data-testid="meal-protein" /></Field>
            <Field label="Carbs (g)"><Input type="number" value={form.carbsG} onChange={e => setForm(f => ({ ...f, carbsG: e.target.value }))} className="w-24" data-testid="meal-carbs" /></Field>
            <Field label="Fats (g)"><Input type="number" value={form.fatsG} onChange={e => setForm(f => ({ ...f, fatsG: e.target.value }))} className="w-24" data-testid="meal-fats" /></Field>
            <Field label="Hydration (ml)"><Input type="number" value={form.hydrationMl} onChange={e => setForm(f => ({ ...f, hydrationMl: e.target.value }))} className="w-28" data-testid="meal-hydration" /></Field>
          </div>
          <div className="mt-3">
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="meal-notes" />
            </Field>
          </div>
          <Button className="mt-4" disabled={saving} onClick={handleCreate} data-testid="save-meal-btn">{saving ? 'Saving…' : 'Save meal'}</Button>
        </Card>
      )}

      {logs === null && <div className="text-sm text-muted-foreground">Loading…</div>}
      {logs !== null && logs.length === 0 && <div className="text-sm text-muted-foreground">No meals logged yet in the last 30 days.</div>}

      {logs !== null && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card">
              <div className="min-w-0">
                <div className="text-sm font-bold">
                  {MEAL_TYPES.find(m => m.value === l.mealType)?.label || l.mealType} &middot; {l.logDate}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[l.foodItems, l.calories && `${l.calories} kcal`, l.proteinG && `${l.proteinG}g protein`, l.hydrationMl && `${l.hydrationMl}ml`].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <button className="w-8 h-8 rounded-sm hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDelete(l.id)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
