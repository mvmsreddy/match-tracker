import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Real ranking-goal tracking for one segment (Phase 3) — replaces Phase 2's
// "coming soon" placeholder. Progress is computed from the segment's actual
// current rank/points (circuit.latest) against the stored target — no
// fabricated pace numbers. A player can have at most one *active* goal per
// segment shown here; older achieved/abandoned goals aren't surfaced yet
// (no history view built for that in this phase).
export default function GoalsPanel({ circuit }) {
  const { user } = useAuth();
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ targetRank: '', targetPoints: '', targetDate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGoals(null);
    api.getRankingGoals(user.id, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setGoals(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load goals'); setGoals([]); } });
    return () => { cancelled = true; };
  }, [user.id, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');

  async function handleSave() {
    setSaving(true);
    try {
      const created = await api.createRankingGoal(user.id, {
        category: circuit.category,
        subcategory: circuit.subcategory,
        targetRank: form.targetRank ? Number(form.targetRank) : null,
        targetPoints: form.targetPoints ? Number(form.targetPoints) : null,
        targetDate: form.targetDate || null,
      });
      setGoals(prev => [created, ...(prev || [])]);
      setEditing(false);
      setForm({ targetRank: '', targetPoints: '', targetDate: '' });
    } catch (e) {
      setError(e.message || 'Could not save goal');
    } finally {
      setSaving(false);
    }
  }

  async function handleAbandon(goalId) {
    try {
      const updated = await api.updateRankingGoal(goalId, { status: 'abandoned' });
      setGoals(prev => prev.map(g => (g.id === updated.id ? updated : g)));
    } catch (e) {
      setError(e.message || 'Could not update goal');
    }
  }

  if (goals === null) return <div className="history-empty">Loading goal…</div>;

  if (!activeGoal && !editing) {
    return (
      <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 16, padding: 22, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>No ranking goal set for {circuit.category} {circuit.subcategory} yet</div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button className="action-btn primary" style={{ marginTop: 14 }} onClick={() => setEditing(true)}>Set a goal</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="perf-chart-title">New goal for {circuit.category} {circuit.subcategory}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Target rank
            <input type="number" value={form.targetRank} onChange={e => setForm(f => ({ ...f, targetRank: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Target points
            <input type="number" value={form.targetPoints} onChange={e => setForm(f => ({ ...f, targetPoints: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Target date
            <input type="date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'inherit' }} />
          </label>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="action-btn primary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save goal'}</button>
          <button className="action-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  const { latest } = circuit;
  // Progress = how far current rank has moved from the FIRST recorded rank
  // toward the target, not an arbitrary baseline — clamped since a player can
  // start already better than their own target, or move the wrong direction.
  const startRank = circuit.points[0]?.rank;
  const rankProgress = activeGoal.targetRank && startRank && startRank !== activeGoal.targetRank
    ? Math.max(0, Math.min(100, Math.round(((startRank - latest.rank) / (startRank - activeGoal.targetRank)) * 100)))
    : null;

  return (
    <div style={{ background: 'linear-gradient(135deg,var(--win-hover) 0%,var(--bg2) 62%)', border: '1px solid var(--border)', borderRadius: 18, padding: 26 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ font: '500 11px/1 monospace', letterSpacing: '.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>Ranking goal</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10 }}>
            {activeGoal.targetRank ? `Top ${activeGoal.targetRank}` : `${activeGoal.targetPoints} points`}
            {activeGoal.targetDate ? ` by ${formatDate(activeGoal.targetDate)}` : ''}
          </div>
        </div>
        <button className="action-btn" onClick={() => handleAbandon(activeGoal.id)}>Abandon goal</button>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Current rank</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{latest.rank}</div>
        </div>
        {activeGoal.targetRank && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Target rank</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--accent)' }}>{activeGoal.targetRank}</div>
          </div>
        )}
      </div>
      {rankProgress !== null && (
        <div style={{ marginTop: 20 }}>
          <div style={{ height: 10, background: 'rgba(0,0,0,.3)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${rankProgress}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8 }}>{rankProgress}% of the way from your first-seen rank to the goal</div>
        </div>
      )}
    </div>
  );
}
