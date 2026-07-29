import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const PERIODS = [
  { id: '1m', label: '1 Month', days: 30 },
  { id: '3m', label: '3 Months', days: 90 },
  { id: '1y', label: '1 Year', days: 365 },
];

const BAR_COLORS = ['bg-primary', 'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-destructive'];

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

// Training log — real training_sessions data, segment-scoped. Volume-by-
// focus-area is a simple count of sessions tagging each free-form
// focus_areas string within the selected period; there's no fixed shot-type
// taxonomy until a drill library exists, so this counts whatever tags the
// player/coach actually logged rather than assuming a fixed stroke list.
export default function TrainingLogTab({ circuit, playerId, isOwnDashboard = true }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('1m');
  const [form, setForm] = useState({ sessionDate: new Date().toISOString().slice(0, 10), durationMinutes: '', focusAreas: '', intensity: 'moderate', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessions(null);
    api.getTrainingSessions(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setSessions(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load training sessions'); setSessions([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const periodDays = PERIODS.find(p => p.id === period).days;
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString().slice(0, 10);
  }, [periodDays]);

  const inPeriod = useMemo(() => (sessions || []).filter(s => s.sessionDate >= cutoff), [sessions, cutoff]);

  const volumeByFocus = useMemo(() => {
    const counts = new Map();
    for (const s of inPeriod) {
      for (const f of s.focusAreas || []) counts.set(f, (counts.get(f) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, pct: Math.round((count / max) * 100), colorCls: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [inPeriod]);

  async function handleLog() {
    setSaving(true);
    try {
      const created = await api.logTrainingSession(playerId, {
        category: circuit.category,
        subcategory: circuit.subcategory,
        sessionDate: form.sessionDate,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        focusAreas: form.focusAreas.split(',').map(s => s.trim()).filter(Boolean),
        intensity: form.intensity,
        notes: form.notes || null,
      });
      setSessions(prev => [created, ...(prev || [])]);
      setForm({ sessionDate: new Date().toISOString().slice(0, 10), durationMinutes: '', focusAreas: '', intensity: 'moderate', notes: '' });
    } catch (e) {
      setError(e.message || 'Could not log session');
    } finally {
      setSaving(false);
    }
  }

  if (sessions === null) return <div className="text-sm text-muted-foreground">Loading training log…</div>;

  return (
    <div className="space-y-4">
      <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1 w-fit">
        {PERIODS.map(p => (
          <button
            key={p.id}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${period === p.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sessions</div>
          <div className="font-display font-extrabold text-xl">{inPeriod.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{PERIODS.find(p => p.id === period).label.toLowerCase()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Focus areas logged</div>
          <div className="font-display font-extrabold text-xl">{volumeByFocus.length}</div>
        </Card>
      </div>

      {isOwnDashboard && (
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm">Log a session</div>
          <div className="flex flex-wrap gap-3 mt-3">
            <Field label="Date">
              <Input type="date" value={form.sessionDate} onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))} className="w-40" />
            </Field>
            <Field label="Duration (min)">
              <Input type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} className="w-24" />
            </Field>
            <div className="flex-1 min-w-44">
              <Field label="Focus areas (comma-separated)">
                <Input type="text" placeholder="forehand, serve" value={form.focusAreas} onChange={e => setForm(f => ({ ...f, focusAreas: e.target.value }))} />
              </Field>
            </div>
            <Field label="Intensity">
              <select
                className="rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9"
                value={form.intensity}
                onChange={e => setForm(f => ({ ...f, intensity: e.target.value }))}
              >
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
          <Button className="mt-3" disabled={saving} onClick={handleLog}>{saving ? 'Saving…' : 'Log session'}</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm">Volume by focus area</div>
          <div className="text-xs text-muted-foreground mb-4">{PERIODS.find(p => p.id === period).label.toLowerCase()}</div>
          {volumeByFocus.length === 0 && <div className="text-sm text-muted-foreground">No sessions logged with focus areas in this period.</div>}
          <div className="space-y-3">
            {volumeByFocus.map(v => (
              <div key={v.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold">{v.name}</span>
                  <span className="font-bold">{v.count}</span>
                </div>
                <div className="h-2 rounded-sm bg-muted"><div className={`h-full rounded-sm ${v.colorCls}`} style={{ width: `${v.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm">Session log</div>
          <div className="text-xs text-muted-foreground mb-4">Most recent first</div>
          {inPeriod.length === 0 && <div className="text-sm text-muted-foreground">No sessions in this period.</div>}
          <div className="space-y-3">
            {inPeriod.map(s => (
              <div key={s.id} className="flex gap-3">
                <div className="w-16 shrink-0 text-right">
                  <div className="text-xs font-bold">{formatDate(s.sessionDate)}</div>
                  {s.durationMinutes && <div className="text-[10px] text-muted-foreground">{s.durationMinutes} min</div>}
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{(s.focusAreas || []).join(', ') || 'General session'}</div>
                  {s.notes && <div className="text-xs text-muted-foreground mt-0.5">{s.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
