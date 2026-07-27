import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeDrillCorrelation } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';

const STROKES = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'Other'];
const SKILL_KEYS = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'BreakPointConversion', 'SecondServe', 'RallyTolerance', 'ServeUnderFatigue'];

// Drill library — the Phase 31 table plus Phase 32's spec fields, with a
// real "success rate" pulled from computeDrillCorrelation (this drill's own
// completed assignments) rather than a fabricated number. A drill with no
// completed assignments yet shows "not yet measured", not a guess.
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

  if (drills === null) return <div className="history-empty">Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <button className="pcd-btn-primary" onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : '+ New drill'}</button>
      </div>

      {error && <div className="history-empty">{error}</div>}

      {creating && (
        <div className="pcd-card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', flex: 1, minWidth: 200 }}>
              Title
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Focus stroke (display)
              <select value={form.focusStroke} onChange={e => setForm(f => ({ ...f, focusStroke: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }}>
                {STROKES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Skill group it targets
              <select value={form.skillKey} onChange={e => setForm(f => ({ ...f, skillKey: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }}>
                {SKILL_KEYS.map(k => <option key={k} value={k}>{SKILL_LABELS[k] || k}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Difficulty
              <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 12 }}>
            Description
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Volume (display)
              <input placeholder="e.g. 1,000 balls" value={form.defaultVolume} onChange={e => setForm(f => ({ ...f, defaultVolume: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Default frequency/week
              <input type="number" value={form.defaultFrequencyPerWeek} onChange={e => setForm(f => ({ ...f, defaultFrequencyPerWeek: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', width: 90 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Default duration (weeks)
              <input type="number" value={form.defaultDurationWeeks} onChange={e => setForm(f => ({ ...f, defaultDurationWeeks: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', width: 90 }} />
            </label>
          </div>
          <button className="pcd-btn-primary" style={{ marginTop: 14 }} disabled={saving || !form.title.trim()} onClick={handleCreate}>{saving ? 'Saving…' : 'Save drill'}</button>
        </div>
      )}

      {drills.length === 0 && <div className="history-empty">No drills yet — add the first one above.</div>}

      {drills.length > 0 && (
        <div className="pcd-stat-grid n2">
          {drills.map(d => {
            const stat = statsByDrill.get(d.id);
            const avgRate = stat ? Math.round(stat.rates.reduce((s, r) => s + r, 0) / stat.rates.length) : null;
            const on = !!favs[d.id];
            return (
              <div key={d.id} className="pcd-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--info)' }}>{SKILL_LABELS[d.skillKey] || d.skillKey || d.focusStroke || 'General'}</div>
                    <div style={{ font: "700 17px/1.25 'Archivo', sans-serif", letterSpacing: '-.02em', marginTop: 11 }}>{d.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`pcd-fav-btn${on ? ' active' : ''}`} onClick={() => setFavs(f => ({ ...f, [d.id]: !on }))}>★</button>
                    <button className="pcd-fav-btn" onClick={() => handleDelete(d.id)} title="Delete">✕</button>
                  </div>
                </div>
                {d.description && <div style={{ font: "400 13px/1.55 'Archivo', sans-serif", color: 'var(--text2)' }}>{d.description}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[d.defaultVolume, d.defaultFrequencyPerWeek && `${d.defaultFrequencyPerWeek}×/WEEK`, d.defaultDurationWeeks && `${d.defaultDurationWeeks} WEEKS`, d.difficulty?.toUpperCase()].filter(Boolean).map((tag, i) => (
                    <span key={i} className="pcd-badge sm">{tag}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', paddingTop: 14, borderTop: '1px solid var(--border2)', marginTop: 'auto' }}>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.1em', color: 'var(--text2)' }}>SUCCESS RATE</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 9 }}>
                      <div style={{ font: "700 20px/1 'IBM Plex Mono', monospace", color: avgRate == null ? 'var(--text3)' : (avgRate >= 60 ? 'var(--accent)' : 'var(--opp)') }}>{avgRate == null ? '—' : `${avgRate}%`}</div>
                      <div style={{ font: "400 10px/1 'IBM Plex Mono', monospace", color: 'var(--text3)' }}>{stat ? `${stat.sampleImproved} OF ${stat.sampleTotal} IMPROVED` : 'NOT YET MEASURED'}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
