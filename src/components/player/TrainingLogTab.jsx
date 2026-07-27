import { useEffect, useMemo, useState } from 'react';
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
      .map(([name, count], i) => ({ name, count, pct: Math.round((count / max) * 100), color: BAR_COLORS[i % BAR_COLORS.length] }));
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

  if (sessions === null) return <div className="history-empty">Loading training log…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="pcd-pill-row" style={{ width: 'fit-content' }}>
        {PERIODS.map(p => (
          <button key={p.id} className={`pcd-pill${period === p.id ? ' active' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
        ))}
      </div>

      {error && <div className="history-empty">{error}</div>}

      <div className="pcd-stat-grid n4">
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Sessions</div>
          <div className="pcd-stat-card-value">{inPeriod.length}</div>
          <div className="pcd-stat-card-trend neutral">{PERIODS.find(p => p.id === period).label.toLowerCase()}</div>
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Focus areas logged</div>
          <div className="pcd-stat-card-value">{volumeByFocus.length}</div>
        </div>
      </div>

      <div className="pcd-card">
        <div className="pcd-card-title">Log a session</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Date
            <input type="date" value={form.sessionDate} onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Duration (min)
            <input type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', width: 100 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', flex: 1, minWidth: 180 }}>
            Focus areas (comma-separated)
            <input type="text" placeholder="forehand, serve" value={form.focusAreas} onChange={e => setForm(f => ({ ...f, focusAreas: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Intensity
            <select value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }}>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 12 }}>
          Notes
          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', resize: 'vertical' }} />
        </label>
        <button className="pcd-btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={handleLog}>{saving ? 'Saving…' : 'Log session'}</button>
      </div>

      <div className="pcd-stat-grid n2">
        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 4 }}>Volume by focus area</div>
          <div className="pcd-card-sub" style={{ marginBottom: 22 }}>{PERIODS.find(p => p.id === period).label.toLowerCase()}</div>
          {volumeByFocus.length === 0 && <div className="history-empty">No sessions logged with focus areas in this period.</div>}
          {volumeByFocus.map(v => (
            <div key={v.name} className="pcd-bar-row">
              <div className="pcd-bar-head">
                <span className="pcd-bar-name">{v.name}</span>
                <span className="pcd-bar-value" style={{ color: v.color }}>{v.count}</span>
              </div>
              <div className="pcd-bar-track"><div className="pcd-bar-fill" style={{ width: `${v.pct}%`, background: v.color }} /></div>
            </div>
          ))}
        </div>

        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 4 }}>Session log</div>
          <div className="pcd-card-sub" style={{ marginBottom: 20 }}>Most recent first</div>
          {inPeriod.length === 0 && <div className="history-empty">No sessions in this period.</div>}
          {inPeriod.map(s => (
            <div key={s.id} className="pcd-timeline-row">
              <div className="pcd-timeline-date-col">
                <div className="pcd-timeline-date">{formatDate(s.sessionDate)}</div>
                {s.durationMinutes && <div className="pcd-timeline-dur">{s.durationMinutes} min</div>}
              </div>
              <div className="pcd-timeline-rail">
                <div className="pcd-timeline-dot" style={{ background: 'var(--accent)' }} />
                <div className="pcd-timeline-line" />
              </div>
              <div className="pcd-timeline-body">
                <div className="pcd-timeline-title">{(s.focusAreas || []).join(', ') || 'General session'}</div>
                {s.notes && <div className="pcd-timeline-note">{s.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
