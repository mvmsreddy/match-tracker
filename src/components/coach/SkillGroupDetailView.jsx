import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeSkillGroups } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';

const FREQ_OPTS = [1, 2, 3];
const DUR_OPTS = [4, 6, 8];

// One skill group's roster + a real "suggested routine" (the best-matching
// drill_library row for this skill_key, by measured success rate if any
// completed assignment exists for it, otherwise just the library's
// description with no fabricated success-rate claim) + a real assign flow
// that writes a drill_assignments row (src/lib/coachAnalytics.js's
// computeDrillCorrelation reads it back once the block completes).
export default function SkillGroupDetailView({ groupKey, roster, onBack }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [drills, setDrills] = useState(null);
  const [error, setError] = useState('');
  const [unpicked, setUnpicked] = useState({});
  const [freq, setFreq] = useState(2);
  const [dur, setDur] = useState(4);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    if (!roster) return;
    let cancelled = false;
    Promise.all([computeSkillGroups(roster), api.getDrillLibrary()])
      .then(([g, d]) => { if (!cancelled) { setGroups(g); setDrills(d); } })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load group'); });
    return () => { cancelled = true; };
  }, [roster]);

  const group = useMemo(() => {
    if (!groups) return null;
    return groups.find(g => `${g.category}|${g.subcategory}|${g.skillKey}` === groupKey) || null;
  }, [groups, groupKey]);

  const routine = useMemo(() => {
    if (!drills || !group) return null;
    return drills.find(d => d.skillKey === group.skillKey) || null;
  }, [drills, group]);

  const picked = useMemo(() => (group ? group.members.filter(m => !unpicked[m.playerId]) : []), [group, unpicked]);

  async function handleAssign() {
    if (!group || !routine || picked.length === 0) return;
    setAssigning(true);
    try {
      await api.createDrillAssignment({
        coachId: user.id, drillId: routine.id, category: group.category, subcategory: group.subcategory,
        skillKey: group.skillKey, playerIds: picked.map(m => m.playerId), frequencyPerWeek: freq, durationWeeks: dur,
      });
      setAssigned(true);
    } catch (e) {
      setError(e.message || 'Could not assign routine');
    } finally {
      setAssigning(false);
    }
  }

  if (groups === null) return <div className="history-empty">Loading group…</div>;
  if (error) return <div className="history-empty">{error}</div>;
  if (!group) return <div className="history-empty">Group not found — it may have resolved away as match data changed.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <button className="pcd-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={onBack}>← ALL SKILL GROUPS</button>

      <div className="pcd-hscroll-table">
        <div className="pcd-grid-head-row" style={{ gridTemplateColumns: '1fr 56px minmax(120px,1.4fr) 72px 72px 96px', minWidth: 640 }}>
          <div>Player</div><div>Rank</div><div>Recent vs season</div>
          <div style={{ textAlign: 'right' }}>Recent</div><div style={{ textAlign: 'right' }}>Season</div><div style={{ textAlign: 'right' }}>Matches</div>
        </div>
        {group.members.map(m => (
          <div key={m.playerId} className="pcd-grid-body-row" style={{ gridTemplateColumns: '1fr 56px minmax(120px,1.4fr) 72px 72px 96px', minWidth: 640 }}>
            <div style={{ minWidth: 0, font: "600 14px/1.2 'Archivo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
            <div style={{ font: "500 12px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>#{m.rank}</div>
            <div className="pcd-insight-bar" style={{ marginBottom: 0 }}>
              <div style={{ width: `${m.recentAvg}%`, background: 'var(--opp)', borderRadius: 5 }} />
              <div className="pcd-progress-mark" style={{ left: `${m.seasonAvg}%` }} />
            </div>
            <div style={{ textAlign: 'right', font: "700 14px/1 'IBM Plex Mono', monospace", color: 'var(--opp)' }}>{m.recentAvg}%</div>
            <div style={{ textAlign: 'right', font: "500 13px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>{m.seasonAvg}%</div>
            <div style={{ textAlign: 'right', font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text3)' }}>{m.matchCount} tracked</div>
          </div>
        ))}
      </div>

      <div className="pcd-stat-grid n2">
        <div className="pcd-card" style={{ borderLeft: '3px solid var(--accent)' }}>
          {routine ? (
            <>
              <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>Suggested routine</div>
              <div style={{ font: "700 19px/1.25 'Archivo', sans-serif", letterSpacing: '-.02em', marginTop: 14 }}>{routine.title}</div>
              <div style={{ font: "400 13px/1.55 'Archivo', sans-serif", color: 'var(--text2)', marginTop: 10 }}>{routine.description}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12, marginTop: 20 }}>
                {routine.defaultVolume && (
                  <div style={{ background: 'var(--bg4)', borderRadius: 11, padding: 14 }}>
                    <div style={{ font: "500 10px/1.2 'IBM Plex Mono', monospace", letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>Volume</div>
                    <div style={{ font: "700 17px/1 'Archivo', sans-serif", marginTop: 10 }}>{routine.defaultVolume}</div>
                  </div>
                )}
                {routine.defaultFrequencyPerWeek && (
                  <div style={{ background: 'var(--bg4)', borderRadius: 11, padding: 14 }}>
                    <div style={{ font: "500 10px/1.2 'IBM Plex Mono', monospace", letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>Frequency</div>
                    <div style={{ font: "700 17px/1 'Archivo', sans-serif", marginTop: 10 }}>{routine.defaultFrequencyPerWeek}×/week</div>
                  </div>
                )}
                {routine.defaultDurationWeeks && (
                  <div style={{ background: 'var(--bg4)', borderRadius: 11, padding: 14 }}>
                    <div style={{ font: "500 10px/1.2 'IBM Plex Mono', monospace", letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>Duration</div>
                    <div style={{ font: "700 17px/1 'Archivo', sans-serif", marginTop: 10 }}>{routine.defaultDurationWeeks} weeks</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="history-empty">No drill in your library targets {SKILL_LABELS[group.skillKey] || group.skillKey} yet — add one from Drill Library.</div>
          )}
        </div>

        <div className="pcd-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="pcd-card-title">Assign to this group</div>

          <div>
            <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>Players</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {group.members.map(m => {
                const on = !unpicked[m.playerId];
                return (
                  <button key={m.playerId} className={`pcd-chip-toggle${on ? ' active' : ''}`}
                    onClick={() => setUnpicked(u => ({ ...u, [m.playerId]: on }))}>{m.name}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>Frequency</div>
            <div className="pcd-pill-row" style={{ width: 'fit-content' }}>
              {FREQ_OPTS.map(f => (
                <button key={f} className={`pcd-pill${freq === f ? ' active' : ''}`} onClick={() => { setFreq(f); setAssigned(false); }}>{f}×/week</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 10 }}>Block length</div>
            <div className="pcd-pill-row" style={{ width: 'fit-content' }}>
              {DUR_OPTS.map(d => (
                <button key={d} className={`pcd-pill${dur === d ? ' active' : ''}`} onClick={() => { setDur(d); setAssigned(false); }}>{d} weeks</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 11, background: 'var(--bg4)', font: "400 12px/1.5 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>
            {picked.length} of {group.members.length} players · {freq}× per week for {dur} weeks · {freq * dur} sessions each
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 'auto' }}>
            <button className="pcd-btn-primary" disabled={!routine || picked.length === 0 || assigning} onClick={handleAssign}>
              {assigned ? 'Assigned ✓' : (assigning ? 'Assigning…' : 'Assign routine')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
