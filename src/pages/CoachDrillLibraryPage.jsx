import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import * as api from '../api';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';

const STROKES = ['Forehand', 'Backhand', 'Serve', 'Volley', 'Smash', 'Footwork', 'Other'];

export default function CoachDrillLibraryPage() {
  const { theme } = useTheme();
  const [drills, setDrills] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', focusStroke: 'Forehand', difficulty: 'intermediate', videoUrl: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getDrillLibrary()
      .then(data => { if (!cancelled) setDrills(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load drill library'); setDrills([]); } });
    return () => { cancelled = true; };
  }, []);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createDrill(form);
      setDrills(prev => [created, ...(prev || [])]);
      setForm({ title: '', description: '', focusStroke: 'Forehand', difficulty: 'intermediate', videoUrl: '' });
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

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="roster" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Drill Library</h1>
            <div className="subtitle">Routines mapped to weaknesses</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/my-players" className="action-btn">← Roster</Link>
            <button className="action-btn primary" onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : 'New drill'}</button>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}

        {creating && (
          <div className="perf-chart-card">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', flex: 1, minWidth: 200 }}>
                Title
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
                Focus
                <select value={form.focusStroke} onChange={e => setForm(f => ({ ...f, focusStroke: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }}>
                  {STROKES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
                Difficulty
                <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 12 }}>
              Description
              <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit', resize: 'vertical' }} />
            </label>
            <button className="action-btn primary" style={{ marginTop: 14 }} disabled={saving || !form.title.trim()} onClick={handleCreate}>
              {saving ? 'Saving…' : 'Save drill'}
            </button>
          </div>
        )}

        {drills === null && <div className="history-empty">Loading…</div>}
        {drills !== null && drills.length === 0 && <div className="history-empty">No drills yet — add the first one above.</div>}

        {drills && drills.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
            {drills.map(d => (
              <div key={d.id} className="perf-chart-card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ font: '500 10px/1 monospace', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--info)' }}>{d.focusStroke}</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>{d.title}</div>
                  </div>
                  <button className="t-delete-btn" onClick={() => handleDelete(d.id)} title="Delete">✕</button>
                </div>
                {d.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 10 }}>{d.description}</div>}
                {d.difficulty && <span className="t-badge" style={{ marginTop: 12, display: 'inline-block' }}>{d.difficulty}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
