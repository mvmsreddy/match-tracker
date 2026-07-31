import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeDrillCorrelation } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Badge } from '@/components/primitives/badge';

const STROKES = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'Other'];
const SKILL_KEYS = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'BreakPointConversion', 'SecondServe', 'RallyTolerance', 'ServeUnderFatigue'];

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9';

// Drill library — a real "success rate" pulled from computeDrillCorrelation
// (this drill's own completed assignments) rather than a fabricated number.
// A drill with no completed assignments yet shows "not yet measured".
export default function DrillLibraryView() {
  const { user } = useAuth();
  const [drills, setDrills] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [favs, setFavs] = useState({});
  const [form, setForm] = useState({ title: '', description: '', focusStroke: 'Forehand', difficulty: 'intermediate', skillKey: 'Forehand', defaultVolume: '', defaultFrequencyPerWeek: '', defaultDurationWeeks: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getDrillLibrary(), computeDrillCorrelation(user.id)])
      .then(([d, corr]) => { if (!cancelled) { setDrills(d); setCorrelation(corr); } })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load drill library'); setDrills([]); setCorrelation([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  const statsByDrill = useMemo(() => {
    const map = new Map();
    for (const c of (correlation || [])) {
      if (!map.has(c.drillId)) map.set(c.drillId, { rates: [], sampleImproved: 0, sampleTotal: 0, deltas: [] });
      const s = map.get(c.drillId);
      s.rates.push(c.successRate);
      s.sampleTotal += c.playersWithData;
      s.sampleImproved += Math.round((c.successRate / 100) * c.playersWithData);
      s.deltas.push(c.avgAfter - c.avgBefore);
    }
    return map;
  }, [correlation]);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createDrill({
        title: form.title, description: form.description, focusStroke: form.focusStroke, difficulty: form.difficulty,
        skillKey: form.skillKey, defaultVolume: form.defaultVolume || null,
        defaultFrequencyPerWeek: form.defaultFrequencyPerWeek ? Number(form.defaultFrequencyPerWeek) : null,
        defaultDurationWeeks: form.defaultDurationWeeks ? Number(form.defaultDurationWeeks) : null,
      });
      setDrills(prev => [created, ...(prev || [])]);
      setForm({ title: '', description: '', focusStroke: 'Forehand', difficulty: 'intermediate', skillKey: 'Forehand', defaultVolume: '', defaultFrequencyPerWeek: '', defaultDurationWeeks: '' });
      setCreating(false);
    } catch (e) {
      setError(e.message || 'Could not save drill');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this drill?')) return;
    try {
      await api.deleteDrill(id);
      setDrills(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      setError(e.message || 'Could not delete drill');
    }
  }

  if (drills === null) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : '+ New drill'}</Button>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}

      {creating && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-52">
              <Field label="Title">
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </Field>
            </div>
            <Field label="Focus stroke (display)">
              <select className={selectCls} value={form.focusStroke} onChange={e => setForm(f => ({ ...f, focusStroke: e.target.value }))}>
                {STROKES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Skill group it targets">
              <select className={selectCls} value={form.skillKey} onChange={e => setForm(f => ({ ...f, skillKey: e.target.value }))}>
                {SKILL_KEYS.map(k => <option key={k} value={k}>{SKILL_LABELS[k] || k}</option>)}
              </select>
            </Field>
            <Field label="Difficulty">
              <select className={selectCls} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Description">
              <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            <Field label="Volume (display)">
              <Input placeholder="e.g. 1,000 balls" value={form.defaultVolume} onChange={e => setForm(f => ({ ...f, defaultVolume: e.target.value }))} />
            </Field>
            <Field label="Default frequency/week">
              <Input type="number" value={form.defaultFrequencyPerWeek} onChange={e => setForm(f => ({ ...f, defaultFrequencyPerWeek: e.target.value }))} className="w-24" />
            </Field>
            <Field label="Default duration (weeks)">
              <Input type="number" value={form.defaultDurationWeeks} onChange={e => setForm(f => ({ ...f, defaultDurationWeeks: e.target.value }))} className="w-24" />
            </Field>
          </div>
          <Button className="mt-4" disabled={saving || !form.title.trim()} onClick={handleCreate}>{saving ? 'Saving…' : 'Save drill'}</Button>
        </Card>
      )}

      {drills.length === 0 && <div className="text-sm text-muted-foreground">No drills yet — add the first one above.</div>}

      {drills.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {drills.map(d => {
            const stat = statsByDrill.get(d.id);
            const avgRate = stat ? Math.round(stat.rates.reduce((s, r) => s + r, 0) / stat.rates.length) : null;
            const on = !!favs[d.id];
            return (
              <Card key={d.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-400">{SKILL_LABELS[d.skillKey] || d.skillKey || d.focusStroke || 'General'}</div>
                    <div className="font-display font-extrabold text-base tracking-tighter mt-2">{d.title}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className={`w-7 h-7 rounded-sm flex items-center justify-center hover:bg-secondary ${on ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFavs(f => ({ ...f, [d.id]: !on }))}>★</button>
                    <button className="w-7 h-7 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-destructive" onClick={() => handleDelete(d.id)} title="Delete">✕</button>
                  </div>
                </div>
                {d.description && <div className="text-sm text-muted-foreground">{d.description}</div>}
                <div className="flex flex-wrap gap-2">
                  {[d.defaultVolume, d.defaultFrequencyPerWeek && `${d.defaultFrequencyPerWeek}×/week`, d.defaultDurationWeeks && `${d.defaultDurationWeeks} weeks`, d.difficulty].filter(Boolean).map((tag, i) => (
                    <Badge key={i} variant="secondary">{tag}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-3 border-t border-border mt-auto">
                  <div className="flex-1 min-w-32">
                    <div className="text-xs text-muted-foreground">Success rate</div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <div className={`font-display font-extrabold text-xl ${avgRate == null ? 'text-muted-foreground' : (avgRate >= 60 ? 'text-primary' : 'text-destructive')}`}>{avgRate == null ? '—' : `${avgRate}%`}</div>
                      <div className="text-[12px] text-muted-foreground">{stat ? `${stat.sampleImproved} of ${stat.sampleTotal} improved` : 'Not yet measured'}</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
