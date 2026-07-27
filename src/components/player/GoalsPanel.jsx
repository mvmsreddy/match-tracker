import { useEffect, useState } from 'react';
import * as api from '../../api';
import { computeGoalPace, computeRankProgress } from '../../lib/segments';

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
export default function GoalsPanel({ circuit, playerId, isOwnDashboard = true }) {
  const [goals, setGoals] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ targetRank: '', targetPoints: '', targetDate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGoals(null);
    api.getRankingGoals(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setGoals(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load goals'); setGoals([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');

  async function handleSave() {
    setSaving(true);
    try {
      const created = await api.createRankingGoal(playerId, {
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
      <div className="pcd-card" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>No ranking goal set for {circuit.category} {circuit.subcategory} yet</div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        {isOwnDashboard && <button className="pcd-btn-primary" style={{ marginTop: 14 }} onClick={() => setEditing(true)}>Set a goal</button>}
      </div>
    );
  }

  if (editing && isOwnDashboard) {
    return (
      <div className="pcd-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="pcd-card-title">New goal for {circuit.category} {circuit.subcategory}</div>
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
          <button className="pcd-btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save goal'}</button>
          <button className="pcd-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  const { latest } = circuit;
  const startRank = circuit.points[0]?.rank;
  const rankProgress = activeGoal.targetRank ? computeRankProgress(startRank, latest.rank, activeGoal.targetRank) : null;

  // Pace note comes from the shared computeGoalPace so this hero card never
  // disagrees with the topbar/Progress Tracker verdict for the same goal.
  // The elapsed-time marker overlaid on the bar below is still rank-specific
  // (the bar itself is a rank-progress bar) so it's only drawn when that's
  // also the metric the shared verdict picked.
  const goalPace = computeGoalPace(circuit, activeGoal);
  const paceNote = goalPace?.note ?? null;
  let paceMarkPct = null;
  if (goalPace?.metric === 'rank' && rankProgress != null && activeGoal.targetDate) {
    const startMs = new Date(circuit.points[0].date).getTime();
    const endMs = new Date(activeGoal.targetDate).getTime();
    if (endMs > startMs) paceMarkPct = Math.max(0, Math.min(100, Math.round(((Date.now() - startMs) / (endMs - startMs)) * 100)));
  }

  const monthsLeft = activeGoal.targetDate
    ? Math.max(0, Math.round((new Date(activeGoal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : null;
  const pointsNeeded = activeGoal.targetPoints ? Math.max(0, activeGoal.targetPoints - latest.totalPoints) : null;

  return (
    <div className="pcd-hero">
      <div className="pcd-hero-top">
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="pcd-hero-label">Ranking goal</div>
          <div className="pcd-hero-title">
            {activeGoal.targetRank ? `Top ${activeGoal.targetRank}` : `${activeGoal.targetPoints} points`}
            {activeGoal.targetDate ? ` by ${formatDate(activeGoal.targetDate)}` : ''}
          </div>
          {paceNote && <div className="pcd-hero-body">{paceNote.charAt(0) + paceNote.slice(1).toLowerCase()}.</div>}
          {isOwnDashboard && <button className="pcd-btn-secondary" style={{ marginTop: 14 }} onClick={() => handleAbandon(activeGoal.id)}>Abandon goal</button>}
        </div>
        <div className="pcd-hero-stats">
          <div>
            <div className="pcd-hero-stat-label">Current rank</div>
            <div className="pcd-hero-stat-value">{latest.rank}</div>
          </div>
          {activeGoal.targetRank && (
            <div>
              <div className="pcd-hero-stat-label">Target rank</div>
              <div className="pcd-hero-stat-value" style={{ color: 'var(--accent)' }}>{activeGoal.targetRank}</div>
            </div>
          )}
          {pointsNeeded != null && (
            <div>
              <div className="pcd-hero-stat-label">Points needed</div>
              <div className="pcd-hero-stat-value">{pointsNeeded}</div>
            </div>
          )}
          {monthsLeft != null && (
            <div>
              <div className="pcd-hero-stat-label">Months left</div>
              <div className="pcd-hero-stat-value" style={{ color: 'var(--opp)' }}>{monthsLeft}</div>
            </div>
          )}
        </div>
      </div>
      {rankProgress !== null && (
        <div style={{ marginTop: 24 }}>
          <div className="pcd-progress-track lg">
            <div className="pcd-progress-fill" style={{ width: `${rankProgress}%` }} />
            {paceMarkPct != null && <div className="pcd-progress-mark" style={{ left: `${paceMarkPct}%` }} />}
          </div>
          {paceNote && <div className="pcd-progress-note" style={{ color: paceNote.includes('BEHIND') ? 'var(--opp)' : 'var(--text2)' }}>{paceNote}</div>}
        </div>
      )}
    </div>
  );
}
