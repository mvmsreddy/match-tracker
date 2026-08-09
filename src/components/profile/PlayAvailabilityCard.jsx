import { useEffect, useState } from 'react';
import * as api from '../../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';

const SURFACES = ['Hard', 'Clay', 'Grass', 'Any'];
const FORMATS = ['Singles', 'Doubles', 'Either'];

export default function PlayAvailabilityCard({ user }) {
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    area: user.city || '',
    city: user.city || '',
    surface: 'Hard',
    format: 'Singles',
    timeWindow: '',
    notes: '',
  });

  async function reload() {
    setLoading(true);
    try {
      const post = await api.getMyActiveAvailabilityPost(user.id);
      setActive(post);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function handlePost() {
    setSaving(true);
    setError('');
    try {
      await api.createPlayAvailabilityPost(user.id, form);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!active) return;
    setSaving(true);
    try {
      await api.cancelPlayAvailabilityPost(user.id, active.id);
      setActive(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9 w-full';

  return (
    <Card className="p-4 sm:p-6 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Interested to play</div>
        <p className="text-sm text-muted-foreground mt-1">
          Broadcast that you want a hit — shown on your public profile when sharing is on.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : active ? (
        <div className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
          <div className="font-semibold text-accent-ink">Active post</div>
          <div>{[active.city, active.area].filter(Boolean).join(' · ')}</div>
          <div>{[active.surface, active.format, active.timeWindow].filter(Boolean).join(' · ')}</div>
          {active.notes && <div className="text-muted-foreground">{active.notes}</div>}
          <div className="text-xs text-muted-foreground">
            Expires {new Date(active.expiresAt).toLocaleDateString()}
          </div>
          <Button size="sm" variant="outline" className="mt-2" disabled={saving} onClick={handleCancel}>
            Remove post
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            City / area
            <Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value, area: e.target.value }))} />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Surface
            <select className={selectCls} value={form.surface} onChange={(e) => setForm((p) => ({ ...p, surface: e.target.value }))}>
              {SURFACES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Format
            <select className={selectCls} value={form.format} onChange={(e) => setForm((p) => ({ ...p, format: e.target.value }))}>
              {FORMATS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            When
            <Input placeholder="This week evenings" value={form.timeWindow} onChange={(e) => setForm((p) => ({ ...p, timeWindow: e.target.value }))} />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1 sm:col-span-2">
            Notes
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Looking for practice match before state tournament" />
          </label>
          <div className="sm:col-span-2">
            <Button size="sm" disabled={saving} onClick={handlePost}>
              {saving ? 'Posting…' : 'Post — interested to play'}
            </Button>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}
    </Card>
  );
}
