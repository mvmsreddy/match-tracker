import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';

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

const BAR_COLORS = ['var(--accent)', 'var(--info)', 'var(--win)', 'var(--forced)', 'var(--opp)'];

// Training log — real training_sessions data (Phase 3), segment-scoped.
// Volume-by-focus-area is a simple count of sessions tagging each free-form
// focus_areas string within the selected period; there's no fixed shot-type
// taxonomy until drill_library (Phase 6) exists, so this counts whatever tags
// the player/coach actually logged rather than assuming a fixed stroke list.
export default function TrainingLogTab({ circuit }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('1m');
  const [form, setForm] = useState({ sessionDate: new Date().toISOString().slice(0, 10), durationMinutes: '', focusAreas: '', intensity: 'moderate', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessions(null);
    api.getTrainingSessions(user.id, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setSessions(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load training sessions'); setSessions([]); } });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

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
      .map(([name, count], i) => ({ name, count, pct: Math.round((count / max) * 100), color: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [inPeriod]);

  async function handleLog() {
    setSaving(true);
    try {
      const created = await api.logTrainingSession(user.id, {
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

  if (sessions === null) return <div className="history-empty">Loading training log…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="perf-body-row">
        {PERIODS.map(p => (
          <button key={p.id} className={`perf-body-pill${period === p.id ? ' active' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {error && <div className="history-empty">{error}</div>}

      <div className="perf-chart-card">
        <div className="perf-chart-title">Log a session</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Date
            <input type="date" value={form.sessionDate} onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Duration (min)
            <input type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', width: 100 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', flex: 1, minWidth: 180 }}>
            Focus areas (comma-separated)
            <input type="text" placeholder="forehand, serve" value={form.focusAreas} onChange={e => setForm(f => ({ ...f, focusAreas: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Intensity
            <select value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }}>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 12 }}>
          Notes
          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', resize: 'vertical' }} />
        </label>
        <button className="action-btn primary" style={{ marginTop: 14 }} disabled={saving} onClick={handleLog}>{saving ? 'Saving…' : 'Log session'}</button>
      </div>

      <div className="perf-chart-card">
        <div className="perf-chart-title">Volume by focus area</div>
        <div className="perf-chart-subtitle">{PERIODS.find(p => p.id === period).label.toLowerCase()}</div>
        {volumeByFocus.length === 0 && <div className="history-empty">No sessions logged with focus areas in this period.</div>}
        {volumeByFocus.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 6px' }}>
            {volumeByFocus.map(v => (
              <div key={v.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{v.name}</span>
                  <span style={{ color: v.color, fontWeight: 600 }}>{v.count}</span>
                </div>
                <div style={{ height: 10, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${v.pct}%`, height: '100%', background: v.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="perf-chart-card">
        <div className="perf-chart-title">Session log</div>
        <div className="perf-chart-subtitle">Most recent first</div>
        {inPeriod.length === 0 && <div className="history-empty">No sessions in this period.</div>}
        {inPeriod.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '10px 6px' }}>
            {inPeriod.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                <div style={{ flex: 'none', width: 52, textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{formatDate(s.sessionDate)}</div>
                  {s.durationMinutes && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{s.durationMinutes} min</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{(s.focusAreas || []).join(', ') || 'General session'}</div>
                  {s.notes && <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6 }}>{s.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
