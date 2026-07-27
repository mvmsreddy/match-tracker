import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { computeDrillCorrelation } from '../../lib/coachAnalytics';
import { SKILL_LABELS } from './SkillGroupsView';

function verdict(rate) {
  if (rate >= 60) return { label: 'Working', color: 'var(--accent)' };
  if (rate >= 40) return { label: 'Modest gain', color: 'var(--info)' };
  return { label: 'Not working', color: 'var(--opp)' };
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Progress correlation — real, from src/lib/coachAnalytics.js's
// computeDrillCorrelation: each card is one completed assignment (its
// block has actually run its full duration), comparing each assigned
// player's last 4 tracked matches before the block against their first 4
// after it. No card appears until a block has genuinely completed with
// enough tracked-match data on both sides — never fabricated sample data.
export default function CorrelationView() {
  const { user } = useAuth();
  const [correlation, setCorrelation] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    computeDrillCorrelation(user.id)
      .then(data => { if (!cancelled) setCorrelation(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not compute correlation'); setCorrelation([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  if (correlation === null) return <div className="history-empty">Comparing before/after match data for completed drill blocks…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  if (correlation.length === 0) {
    return (
      <div className="pcd-empty-card">
        <div className="pcd-empty-card-title">No completed drill blocks yet</div>
        <div className="pcd-empty-card-body">
          Assign a routine from a Skill Group, and once its block runs its full duration with tracked matches on both
          sides, real before/after results will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: "400 12px/1.5 'Archivo', sans-serif", color: 'var(--text2)', maxWidth: '80ch' }}>
        Each block compares the skill metric in each assigned player's last 4 tracked matches before the block with
        their first 4 tracked matches after it. Success rate is the share of assigned players who improved by more
        than three points.
      </div>

      {correlation.map(c => {
        const v = verdict(c.successRate);
        const maxVal = Math.max(c.avgBefore, c.avgAfter, 1);
        return (
          <div key={c.assignmentId} className="pcd-card" style={{ borderLeft: `3px solid ${v.color}` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', textTransform: 'uppercase', color: v.color }}>{v.label}</div>
                <div style={{ font: "700 18px/1.3 'Archivo', sans-serif", letterSpacing: '-.02em', marginTop: 12 }}>
                  {c.drillTitle} → {SKILL_LABELS[c.skillKey] || c.skillKey}
                </div>
                <div style={{ font: "400 12px/1.4 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 9 }}>
                  {c.playersWithData} of {c.playersAssigned} assigned players with data · {c.frequencyPerWeek}×/week · {c.durationWeeks}-week block · started {formatDate(c.startDate)}
                </div>
              </div>
              <div style={{ flex: 'none', textAlign: 'right' }}>
                <div style={{ font: "500 10px/1 'IBM Plex Mono', monospace", letterSpacing: '.14em', color: 'var(--text2)', whiteSpace: 'nowrap' }}>SUCCESS RATE</div>
                <div style={{ font: "800 34px/1 'Archivo', sans-serif", letterSpacing: '-.035em', color: v.color, marginTop: 10 }}>{c.successRate}%</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '124px minmax(80px,1fr) 60px', columnGap: 14, alignItems: 'center' }}>
                <div style={{ font: "500 11px/1 'IBM Plex Mono', monospace", letterSpacing: '.1em', color: 'var(--text2)' }}>4 MATCHES BEFORE</div>
                <div className="pcd-bar-track"><div className="pcd-bar-fill" style={{ width: `${(c.avgBefore / maxVal) * 100}%`, background: 'var(--text3)' }} /></div>
                <div style={{ textAlign: 'right', font: "700 14px/1 'IBM Plex Mono', monospace", color: 'var(--text2)' }}>{c.avgBefore}%</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '124px minmax(80px,1fr) 60px', columnGap: 14, alignItems: 'center' }}>
                <div style={{ font: "500 11px/1 'IBM Plex Mono', monospace", letterSpacing: '.1em', color: 'var(--text2)' }}>4 MATCHES AFTER</div>
                <div className="pcd-bar-track"><div className="pcd-bar-fill" style={{ width: `${(c.avgAfter / maxVal) * 100}%`, background: v.color }} /></div>
                <div style={{ textAlign: 'right', font: "700 14px/1 'IBM Plex Mono', monospace", color: v.color }}>{c.avgAfter}%</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
