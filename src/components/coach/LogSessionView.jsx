import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { SKILL_LABELS } from './SkillGroupsView';

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

// Bulk session logging — real training_sessions writes, one row per
// (present player × checked drill) pair actually on that drill's
// assignment, matching the mockup's own "session rows written = drills
// completed × players present" framing exactly. Checklist and present-
// player list are built from this coach's real active drill_assignments +
// roster, not a fixed daily schedule (none exists in this data model — see
// Missing Systems).
export default function LogSessionView({ roster }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState(null);
  const [unloggedFlags, setUnloggedFlags] = useState({});
  const [error, setError] = useState('');
  const [checkedAssignments, setCheckedAssignments] = useState({});
  const [presentPlayers, setPresentPlayers] = useState({});
  const [date, setDate] = useState(todayIso());
  const [duration, setDuration] = useState('120');
  const [court, setCourt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getDrillAssignments(user.id)
      .then(async (all) => {
        if (cancelled) return;
        const active = all.filter(a => a.status === 'active');
        setAssignments(active);
        const cutoff = daysAgoIso(7);
        const flags = {};
        await Promise.all(active.map(async (a) => {
          const rows = await Promise.all(a.playerIds.map(pid => api.getTrainingSessions(pid, a.category, a.subcategory)));
          const anyRecent = rows.some(sessions => (sessions || []).some(s => s.sessionDate >= cutoff && (s.drillIds || []).includes(a.drillId)));
          flags[a.id] = !anyRecent;
        }));
        if (!cancelled) setUnloggedFlags(flags);
      })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load assigned blocks'); setAssignments([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  const doneAssignments = useMemo(() => (assignments || []).filter(a => checkedAssignments[a.id]), [assignments, checkedAssignments]);
  const presentIds = useMemo(() => Object.keys(presentPlayers).filter(id => presentPlayers[id]), [presentPlayers]);

  // Rows actually written on save = present players who are on the checked
  // assignment's own player list — not every present player × every drill.
  const plannedRows = useMemo(() => {
    let n = 0;
    for (const a of doneAssignments) n += a.playerIds.filter(pid => presentPlayers[pid]).length;
    return n;
  }, [doneAssignments, presentPlayers]);

  async function handleSave() {
    if (doneAssignments.length === 0 || presentIds.length === 0) return;
    setSaving(true);
    setError('');
    try {
      for (const a of doneAssignments) {
        const rowsFor = a.playerIds.filter(pid => presentPlayers[pid]);
        for (const playerId of rowsFor) {
          await api.logTrainingSession(playerId, {
            category: a.category, subcategory: a.subcategory,
            sessionDate: date, durationMinutes: duration ? Number(duration) : null,
            focusAreas: [SKILL_LABELS[a.skillKey] || a.skillKey],
            drillIds: [a.drillId],
            notes: notes || null,
          });
        }
      }
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Could not log session');
    } finally {
      setSaving(false);
    }
  }

  if (assignments === null) return <div className="history-empty">Loading assigned blocks…</div>;

  const unloggedList = (assignments || []).filter(a => unloggedFlags[a.id]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, alignItems: 'start' }}>
      <div className="pcd-card" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <div className="pcd-card-title">What happened on court</div>
          <div className="pcd-card-sub">From your active assigned blocks — check what was actually completed</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Date
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setSaved(false); }}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Duration (min)
            <input type="number" value={duration} onChange={e => { setDuration(e.target.value); setSaved(false); }}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
            Court
            <input value={court} onChange={e => setCourt(e.target.value)} placeholder="Court 2 · hard"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit' }} />
          </label>
        </div>

        <div>
          <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>Drills completed</div>
          {(assignments || []).length === 0 && <div className="history-empty">No active assigned blocks — assign a routine from a Skill Group first.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(assignments || []).map(a => {
              const on = !!checkedAssignments[a.id];
              return (
                <button key={a.id} className={`pcd-check-row${on ? ' active' : ''}`} onClick={() => { setCheckedAssignments(c => ({ ...c, [a.id]: !on })); setSaved(false); }}>
                  <div className={`pcd-check-box${on ? ' active' : ''}`}>{on ? '✓' : ''}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "600 14px/1.2 'Archivo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.drillTitle}</div>
                    <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 5 }}>
                      {a.category} {a.subcategory} · {SKILL_LABELS[a.skillKey] || a.skillKey}
                    </div>
                  </div>
                  <div style={{ justifySelf: 'end', font: "600 13px/1 'IBM Plex Mono', monospace", color: on ? 'var(--accent)' : 'var(--text3)' }}>{a.playerIds.length} players</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>Players present</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(roster || []).map(p => {
              const on = !!presentPlayers[p.id];
              return (
                <button key={p.id} className={`pcd-chip-toggle${on ? ' active' : ''}`}
                  onClick={() => { setPresentPlayers(pr => ({ ...pr, [p.id]: !on })); setSaved(false); }}>{p.displayName}</button>
              );
            })}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
          Notes · visible to the player
          <textarea rows={3} value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }}
            style={{ padding: '12px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg4)', color: 'inherit', resize: 'vertical' }} />
        </label>

        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

        <button className="pcd-btn-primary" disabled={saving || doneAssignments.length === 0 || presentIds.length === 0} onClick={handleSave}>
          {saved ? 'Session logged ✓' : (saving ? 'Saving…' : 'Log session')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 4 }}>Session summary</div>
          <div className="pcd-card-sub" style={{ marginBottom: 18 }}>Attributed to every selected player</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 14, borderRadius: 11, background: 'var(--bg4)' }}>
              <div style={{ font: "500 12px/1.3 'IBM Plex Mono', monospace", letterSpacing: '.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>Blocks completed</div>
              <div style={{ font: "700 16px/1 'IBM Plex Mono', monospace" }}>{doneAssignments.length}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 14, borderRadius: 11, background: 'var(--bg4)' }}>
              <div style={{ font: "500 12px/1.3 'IBM Plex Mono', monospace", letterSpacing: '.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>Players present</div>
              <div style={{ font: "700 16px/1 'IBM Plex Mono', monospace", color: presentIds.length ? 'var(--accent)' : 'var(--opp)' }}>{presentIds.length}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 14, borderRadius: 11, background: 'var(--bg4)' }}>
              <div style={{ font: "500 12px/1.3 'IBM Plex Mono', monospace", letterSpacing: '.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>Session rows to write</div>
              <div style={{ font: "700 16px/1 'IBM Plex Mono', monospace" }}>{plannedRows}</div>
            </div>
          </div>
        </div>

        <div className="pcd-card">
          <div className="pcd-card-title" style={{ marginBottom: 18 }}>Unlogged this week</div>
          {unloggedList.length === 0 && <div className="history-empty">Every active block has a session logged in the last 7 days.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unloggedList.map(a => (
              <div key={a.id} className="pcd-row" style={{ borderLeftColor: 'var(--opp)' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ font: "600 13px/1.2 'Archivo', sans-serif" }}>{a.drillTitle}</div>
                  <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 5 }}>{a.playerIds.length} players · no session in 7 days</div>
                </div>
                <button className="pcd-btn-secondary" onClick={() => setCheckedAssignments(c => ({ ...c, [a.id]: true }))}>Log</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
