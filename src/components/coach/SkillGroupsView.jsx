import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { computeSkillGroups, computeGoalPaceSummary, computeDrillCorrelation } from '../../lib/coachAnalytics';

export const SKILL_LABELS = {
  Forehand: 'Forehand', Backhand: 'Backhand', Serve: 'Serve', Volley: 'Volley', Smash: 'Smash',
  BreakPointConversion: 'Break-point conversion', SecondServe: 'Second-serve consistency',
};
const SKILL_ACCENTS = {
  Forehand: 'var(--info)', Backhand: 'var(--opp)', Serve: 'var(--info)', Volley: 'var(--info)', Smash: 'var(--info)',
  BreakPointConversion: 'var(--opp)', SecondServe: 'var(--info)',
};

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Skill Groups landing — every group here is computed live from
// src/lib/coachAnalytics.js's computeSkillGroups (real relative-threshold
// rule against each player's own season average), never a stored table.
// The "intervention needed" callout only appears when a real completed
// drill block actually underperformed (computeDrillCorrelation) — no
// fabricated narrative when a coach hasn't assigned anything yet.
export default function SkillGroupsView({ roster, onOpenGroup, onGoLibrary, onGoCorrelation }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [pace, setPace] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [hoursThisMonth, setHoursThisMonth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roster) return;
    let cancelled = false;
    Promise.all([
      computeSkillGroups(roster),
      computeGoalPaceSummary(roster),
      computeDrillCorrelation(user.id),
      api.getTrainingSessionsLoggedByCoach(user.id, monthStartIso()),
    ]).then(([g, p, corr, sessions]) => {
      if (cancelled) return;
      setGroups(g); setPace(p); setCorrelation(corr);
      setHoursThisMonth(Math.round(sessions.reduce((s, r) => s + (r.durationMinutes || 0), 0) / 60));
    }).catch(e => { if (!cancelled) { setError(e.message || 'Could not compute skill groups'); setGroups([]); } });
    return () => { cancelled = true; };
  }, [roster, user.id]);

  const worstCorrelation = useMemo(() => {
    if (!correlation || correlation.length === 0) return null;
    const worst = [...correlation].sort((a, b) => a.successRate - b.successRate)[0];
    return worst.successRate < 50 ? worst : null;
  }, [correlation]);

  if (groups === null) return <div className="history-empty">Computing skill groups from tracked matches…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="pcd-stat-grid n4">
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Linked players</div>
          <div className="pcd-stat-card-value">{roster.length}</div>
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Skill gaps flagged</div>
          <div className="pcd-stat-card-value">{groups.length}</div>
          {groups.length > 0 && <div className="pcd-stat-card-trend down">{groups.reduce((s, g) => s + g.members.length, 0)} player-gaps total</div>}
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">On pace for goal</div>
          <div className="pcd-stat-card-value">{pace ? pace.onPaceCount : '—'}</div>
          {pace && <div className="pcd-stat-card-trend neutral">of {pace.totalWithGoals}</div>}
        </div>
        <div className="pcd-stat-card">
          <div className="pcd-stat-card-label">Drill hours logged</div>
          <div className="pcd-stat-card-value">{hoursThisMonth ?? '—'}</div>
          <div className="pcd-stat-card-trend neutral">this month</div>
        </div>
      </div>

      <div style={{ font: "400 12px/1.5 'Archivo', sans-serif", color: 'var(--text2)', maxWidth: '76ch' }}>
        Groups are derived automatically from match analytics — a player joins a group when a tracked metric sits more
        than eight points below their own season average across at least four matches. Override any grouping is not
        yet built (see Missing Systems) — open a group below to assign a routine.
      </div>

      {groups.length === 0 && (
        <div className="pcd-empty-card">
          <div className="pcd-empty-card-title">No skill gaps found yet</div>
          <div className="pcd-empty-card-body">This needs at least 4 tracked matches per player per segment. Ask players to use "Track this match" from their Tournaments tab.</div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="pcd-stat-grid n2">
          {groups.map((g) => {
            const key = `${g.category}|${g.subcategory}|${g.skillKey}`;
            const avgRecent = Math.round(g.members.reduce((s, m) => s + m.recentAvg, 0) / g.members.length);
            const avgSeason = Math.round(g.members.reduce((s, m) => s + m.seasonAvg, 0) / g.members.length);
            const accent = SKILL_ACCENTS[g.skillKey] || 'var(--info)';
            return (
              <div key={key} className="pcd-card" style={{ borderTopColor: accent, borderTopWidth: 3, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: accent }}>
                      {g.category} {g.subcategory}
                    </div>
                    <div style={{ font: "700 19px/1.25 'Archivo', sans-serif", letterSpacing: '-.02em', marginTop: 12 }}>
                      {SKILL_LABELS[g.skillKey] || g.skillKey}
                    </div>
                  </div>
                  <div style={{ flex: 'none', textAlign: 'right' }}>
                    <div style={{ font: "800 30px/1 'Archivo', sans-serif", letterSpacing: '-.03em' }}>{g.members.length}</div>
                    <div style={{ font: "400 10px/1 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 6, whiteSpace: 'nowrap' }}>PLAYERS</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ font: "700 22px/1 'IBM Plex Mono', monospace", color: accent }}>{avgRecent}%</div>
                  <div style={{ font: "400 12px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>GROUP AVG vs</div>
                  <div style={{ font: "600 15px/1 'IBM Plex Mono', monospace" }}>{avgSeason}%</div>
                  <div style={{ font: "400 12px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>OWN SEASON AVG</div>
                </div>
                <div className="pcd-insight-bar" style={{ marginBottom: 0 }}>
                  <div style={{ width: `${avgRecent}%`, background: accent, borderRadius: 5 }} />
                  <div className="pcd-progress-mark" style={{ left: `${avgSeason}%` }} />
                </div>

                <div>
                  {g.members.slice(0, 3).map(m => (
                    <div key={m.playerId} className="pcd-group-player-row">
                      <div className="pcd-group-player-name">
                        <span className="pcd-group-player-dot" style={{ background: accent }} />
                        <span style={{ font: "600 13px/1.2 'Archivo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                      </div>
                      <div style={{ font: "500 11px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>#{m.rank}</div>
                      <div style={{ justifySelf: 'end', font: "600 12px/1 'IBM Plex Mono', monospace", color: accent }}>{m.recentAvg}%</div>
                    </div>
                  ))}
                </div>

                <button className="pcd-btn-secondary" style={{ marginTop: 'auto', padding: '14px', minHeight: 48 }} onClick={() => onOpenGroup(key)}>
                  Open group and assign drills
                </button>
              </div>
            );
          })}
        </div>
      )}

      {worstCorrelation && (
        <div className="pcd-card" style={{ border: '1px solid rgba(255,107,90,.4)' }}>
          <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--opp)' }}>Intervention needed</div>
          <div style={{ font: "700 18px/1.35 'Archivo', sans-serif", letterSpacing: '-.02em', marginTop: 12, maxWidth: '70ch' }}>
            {worstCorrelation.playersWithData} player{worstCorrelation.playersWithData === 1 ? '' : 's'} assigned "{worstCorrelation.drillTitle}" and it hasn't moved {SKILL_LABELS[worstCorrelation.skillKey] || worstCorrelation.skillKey} — {worstCorrelation.successRate}% success rate, the lowest measured block right now.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
            <button className="pcd-btn-primary" style={{ background: 'var(--opp)' }} onClick={onGoCorrelation}>See the correlation data</button>
            <button className="pcd-btn-secondary" onClick={onGoLibrary}>Browse alternatives</button>
          </div>
        </div>
      )}
    </div>
  );
}
