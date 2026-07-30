import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listDrills, createDrill, deleteDrill } from '@/lib/localStore';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Dumbbell, Plus, Trash2, Video, Clock, Zap } from 'lucide-react';

const DRILL_TYPES = [
  { value: 'forehand', label: 'Forehand', icon: '🎾', color: 'primary' },
  { value: 'backhand', label: 'Backhand', icon: '🎾', color: 'chart-3' },
  { value: 'serve', label: 'Serve', icon: '⚡', color: 'chart-4' },
  { value: 'volley', label: 'Volley', icon: '🥎', color: 'chart-2' },
  { value: 'footwork', label: 'Footwork', icon: '🏃', color: 'chart-5' },
  { value: 'fitness', label: 'Fitness / Conditioning', icon: '💪', color: 'destructive' },
  { value: 'match_play', label: 'Match Play', icon: '🏆', color: 'primary' },
  { value: 'other', label: 'Other', icon: '📓', color: 'muted' },
];

const INTENSITY = [
  { value: 'low', label: 'Low', color: 'chart-2' },
  { value: 'medium', label: 'Medium', color: 'chart-4' },
  { value: 'high', label: 'High', color: 'destructive' },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function DrillsPage() {
  const { user } = useAuth();
  const [drills, setDrills] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(), type: 'forehand', duration: '', intensity: 'medium',
    notes: '', videoUrl: '',
  });

  useEffect(() => { setDrills(listDrills(user.id)); }, [user.id]);

  function handleAdd() {
    if (!form.type) return;
    const created = createDrill(user.id, {
      date: form.date,
      type: form.type,
      duration: form.duration ? Number(form.duration) : null,
      intensity: form.intensity,
      notes: form.notes || null,
      videoUrl: form.videoUrl || null,
    });
    setDrills([created, ...drills]);
    setForm({ date: todayIso(), type: 'forehand', duration: '', intensity: 'medium', notes: '', videoUrl: '' });
    setCreating(false);
  }

  function handleDelete(id) {
    if (!window.confirm('Delete this drill entry?')) return;
    deleteDrill(user.id, id);
    setDrills(drills.filter(d => d.id !== id));
  }

  const weekCutoff = new Date(); weekCutoff.setDate(weekCutoff.getDate() - 7);
  const weekCutoffIso = weekCutoff.toISOString().slice(0, 10);
  const weekDrills = drills.filter(d => d.date >= weekCutoffIso);
  const totalMinsThisWeek = weekDrills.reduce((s, d) => s + (d.duration || 0), 0);
  const highIntensityCount = weekDrills.filter(d => d.intensity === 'high').length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-5xl mx-auto space-y-5" data-testid="drills-page">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">
          <Dumbbell className="w-3.5 h-3.5" />
          Training Library
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter mt-1">Drills</h1>
        <div className="text-sm text-muted-foreground mt-0.5">Log training sessions with videos & intensity</div>
      </div>

      {/* Week stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
            <Dumbbell className="w-3.5 h-3.5" />Drills
          </div>
          <div className="font-display font-extrabold text-2xl tracking-tighter">{weekDrills.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">This week</div>
        </Card>
        <Card className="p-3 sm:p-4 bg-primary/5 border-l-4 border-l-primary">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5" />Time
          </div>
          <div className="font-display font-extrabold text-2xl tracking-tighter text-primary">{totalMinsThisWeek}</div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">Minutes</div>
        </Card>
        <Card className="p-3 sm:p-4 bg-destructive/5 border-l-4 border-l-destructive">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1">
            <Zap className="w-3.5 h-3.5" />High
          </div>
          <div className="font-display font-extrabold text-2xl tracking-tighter text-destructive">{highIntensityCount}</div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">Sessions</div>
        </Card>
      </div>

      <Button size="sm" onClick={() => setCreating(v => !v)} data-testid="add-drill-toggle">
        {creating ? 'Cancel' : (<><Plus className="w-4 h-4 mr-1" /> Log a drill</>)}
      </Button>

      {creating && (
        <Card className="p-4 sm:p-6 shadow-sm">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-semibold">Date</span>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-semibold">Duration (min)</span>
                <Input type="number" min="1" placeholder="45" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
              </label>
            </div>

            <div>
              <div className="text-xs text-muted-foreground font-semibold mb-2">Focus area</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DRILL_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.value })}
                    className={`p-2 rounded-lg border text-xs font-semibold transition-all ${
                      form.type === t.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                    data-testid={`drill-type-${t.value}`}
                  >
                    <div className="text-lg mb-0.5">{t.icon}</div>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground font-semibold mb-2">Intensity</div>
              <div className="grid grid-cols-3 gap-2">
                {INTENSITY.map(i => (
                  <button
                    key={i.value}
                    type="button"
                    onClick={() => setForm({ ...form, intensity: i.value })}
                    className={`py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                      form.intensity === i.value ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                    }`}
                    data-testid={`drill-intensity-${i.value}`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground font-semibold">Video URL (optional — YouTube / Vimeo)</span>
              <Input type="url" placeholder="https://youtu.be/..." value={form.videoUrl} onChange={e => setForm({ ...form, videoUrl: e.target.value })} />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground font-semibold">Notes</span>
              <Textarea rows={2} placeholder="What did you work on? What went well?" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </label>

            <Button onClick={handleAdd} data-testid="save-drill-btn">Save drill</Button>
          </div>
        </Card>
      )}

      {drills.length === 0 && !creating && (
        <Card className="p-8 text-center border-2 border-dashed">
          <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <div className="text-sm text-muted-foreground">No drills logged yet — tap "Log a drill" to start building your training library.</div>
        </Card>
      )}

      {drills.length > 0 && (
        <div className="space-y-2.5">
          {drills.map(d => {
            const type = DRILL_TYPES.find(t => t.value === d.type) || DRILL_TYPES[7];
            const intensity = INTENSITY.find(i => i.value === d.intensity);
            return (
              <div
                key={d.id}
                className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary transition-colors"
                data-testid={`drill-item-${d.id}`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-lg">
                  {type.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-bold">{type.label}</div>
                    {intensity && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `hsl(var(--color-${intensity.color}) / 0.15)`, color: `hsl(var(--color-${intensity.color}))` }}
                      >
                        {intensity.label}
                      </span>
                    )}
                    {d.videoUrl && (
                      <a href={d.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                        <Video className="w-3 h-3" /> Video
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {d.date}{d.duration ? ` · ${d.duration} min` : ''}
                  </div>
                  {d.notes && (
                    <div className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{d.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  aria-label="Delete drill"
                  data-testid={`delete-drill-${d.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
