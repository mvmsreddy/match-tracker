import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { aggregateStrokeBreakdown, strokeWinRates } from '../../lib/segmentAnalytics';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { seedCountForDraw, roundDepth, ROUND_ORDER, estimateExpectedPoints } from '../../utils/aitaGradeRules';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// This player's own historically-typical furthest round reached in this
// segment (median depth across real completed matches from
// useSegmentMatchSchedule) — feeds estimateExpectedPoints below. Real data
// only: returns null (caller omits the points figure) when there's nothing
// to go on yet.
function historicalRound(recentMatches) {
  const depths = recentMatches.map(m => roundDepth(m.round)).filter(d => d >= 0).sort((a, b) => a - b);
  if (depths.length === 0) return null;
  return ROUND_ORDER[depths[Math.floor(depths.length / 2)]];
}

// Placeholder library — see Missing Systems: there is no real coach-assigned
// drill linkage yet (drill_library has no player/assignment column, and no
// player-facing page ever reads it). Shown only when this player has a real
// active coach link, per the mockup's own structure, with generic content
// tied to what's actually true (stroke that needs work) rather than fabricated
// drill names sourced from nowhere.
function placeholderDrills(stroke) {
  const s = (stroke || 'Groundstroke').toLowerCase();
  return [
    { name: `${stroke || 'Groundstroke'} consistency reps`, meta: 'ASK YOUR COACH TO ASSIGN' },
    { name: `${s.includes('serve') ? 'Second-serve' : 'Break-point'} pressure drills`, meta: 'ASK YOUR COACH TO ASSIGN' },
  ];
}

// Rule-based (explicitly v1, not ML) recommendations — cross-references the
// segment's real ranking goal (Phase 3) with its weakest tracked stroke
// (Phase 5 aggregation) and its recent tournament-entry pace. Every segment
// shown here is this player's own independent standing in that category —
// no cross-segment point-transfer suggestions (the "cascading points" idea
// from an early draft of this spec was checked against AITA's actual rules
// and found false; see the plan doc's Context section). If this player is
// also active in another segment, that segment's own real progress can be
// viewed independently by switching segments in the picker above.
//
// "Suggested entries" expected-points uses the real AITA ranking-points-by-
// round table (src/utils/aitaGradeRules.js POINTS_BY_ROUND, transcribed from
// the AITA rules PDF) priced at this player's own historically-typical
// furthest round reached in this segment — not a guessed number.
export default function RecommendationsTab({ circuit, playerId }) {
  const [goals, setGoals] = useState(null);
  const [matches, setMatches] = useState(null);
  const [entries, setEntries] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [coachLink, setCoachLink] = useState(null);
  const [error, setError] = useState('');
  const schedule = useSegmentMatchSchedule(playerId, circuit);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.getRankingGoals(playerId, circuit.category, circuit.subcategory),
      api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory),
      api.getMyEntries(playerId),
      api.listAitaTournaments({ ageGroup: circuit.subcategory.replace('-', ''), dateFrom: today }),
      api.getCoachLinks(playerId),
    ]).then(([g, m, e, cal, links]) => {
      if (cancelled) return;
      setGoals(g); setMatches(m); setEntries(e); setCalendar(cal);
      setCoachLink((links || []).find(l => l.status === 'active' && l.playerId === playerId) || null);
    }).catch(err => { if (!cancelled) { setError(err.message || 'Could not load recommendations'); setGoals([]); setMatches([]); setEntries([]); setCalendar([]); } });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const activeGoal = (goals || []).find(g => g.status === 'active');
  const tracked = useMemo(() => (matches || []).filter(m => m.points?.length > 0), [matches]);

  const weakestStroke = useMemo(() => {
    if (tracked.length === 0) return null;
    const rates = strokeWinRates(aggregateStrokeBreakdown(tracked)).filter(r => r.winRate !== null);
    if (rates.length === 0) return null;
    return rates.reduce((worst, r) => (r.winRate < worst.winRate ? r : worst));
  }, [tracked]);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter(e => {
      if (!e.event) return false;
      const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
      return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
    });
  }, [entries, circuit]);

  const recentEntries90d = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return segmentEntries.filter(e => (e.event.week?.startDate || '') >= cutoffIso).length;
  }, [segmentEntries]);

  const suggestedEntries = useMemo(() => {
    if (!calendar) return [];
    const myRank = circuit.latest.rank;
    const enteredKey = new Set(segmentEntries.map(e => `${(e.event.week?.name || '').toLowerCase()}|${e.event.week?.startDate}`));
    const round = historicalRound(schedule.recent);
    return calendar
      .filter(t => {
        const seg = normalizeEventSegment(t.category, t.ageGroup);
        if (!seg || seg.category !== circuit.category || seg.subcategory !== circuit.subcategory) return false;
        // Best-effort "not yet entered" check — aita_tournaments (the AITA
        // calendar mirror) has no foreign key into this app's own events, so
        // this matches on name+date rather than a real join.
        return !enteredKey.has(`${(t.name || '').toLowerCase()}|${t.startDate}`);
      })
      .slice(0, 4)
      .map(t => {
        const seeds = t.drawSize ? seedCountForDraw(t.drawSize) : null;
        const likelySeeded = seeds && myRank && myRank <= seeds;
        const expected = estimateExpectedPoints({ grade: t.grade, historicalRound: round });
        return {
          id: t.id, name: t.name, meta: `${formatDate(t.startDate)} · ${t.city || ''} · ${t.grade || ''}${t.drawSize ? ` · ${t.drawSize} DRAW` : ''}`,
          seedLabel: likelySeeded ? `LIKELY SEEDED (TOP ${seeds})` : (seeds ? 'UNSEEDED RANGE' : null),
          expected,
        };
      });
  }, [calendar, circuit, segmentEntries, schedule.recent]);

  if (goals === null) return <div className="history-empty">Loading recommendations…</div>;
  if (error) return <div className="history-empty">{error}</div>;

  const rankGap = activeGoal?.targetRank ? circuit.latest.rank - activeGoal.targetRank : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!activeGoal && (
        <div className="history-empty">
          Set a ranking goal in the Overview tab to get gap-to-goal recommendations for {circuit.category} {circuit.subcategory}.
        </div>
      )}

      {activeGoal && rankGap !== null && (
        <div className="pcd-rec-banner">
          <div className="pcd-rec-banner-label">Gap to goal</div>
          <div className="pcd-rec-banner-body">
            {rankGap > 0
              ? <>You need to climb <span style={{ color: 'var(--accent)' }}>{rankGap} ranking places</span> to reach top {activeGoal.targetRank} in {circuit.category} {circuit.subcategory}.</>
              : <>You're already at or ahead of your top {activeGoal.targetRank} target for {circuit.category} {circuit.subcategory}.</>}
          </div>
        </div>
      )}

      <div className="pcd-rec-card">
        <div className="pcd-rec-top">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="pcd-rec-tags">
              <span className="pcd-rec-tag" style={{ background: 'rgba(198,226,61,.14)', color: 'var(--accent)' }}>ENTRY STRATEGY</span>
              <span className="pcd-rec-priority">PRIORITY 1</span>
            </div>
            <div className="pcd-rec-title">Events you haven't entered yet in this segment</div>
            <div className="pcd-rec-why">
              Expected points = your historically-typical furthest round in {circuit.category} {circuit.subcategory}, priced at that round for each event's actual grade.
            </div>
          </div>
        </div>
        {suggestedEntries.length === 0 && (
          <div className="pcd-rec-section"><div className="history-empty">No upcoming {circuit.category} {circuit.subcategory} events found on the AITA calendar right now.</div></div>
        )}
        {suggestedEntries.length > 0 && (
          <div className="pcd-rec-section">
            <div className="pcd-rec-section-label">Suggested entries</div>
            {suggestedEntries.map(e => (
              <div key={e.id} className="pcd-entry-row">
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ font: "600 14px/1.2 'Archivo', sans-serif" }}>{e.name}</div>
                  <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 6 }}>{e.meta}</div>
                </div>
                {e.seedLabel && <span className="pcd-badge info">{e.seedLabel}</span>}
                <div style={{ flex: 'none', textAlign: 'right', minWidth: 70 }}>
                  <div style={{ font: "700 16px/1 'IBM Plex Mono', monospace", color: 'var(--accent)' }}>{e.expected != null ? `~${e.expected}` : '—'}</div>
                  <div style={{ font: "400 9px/1 'IBM Plex Mono', monospace", color: 'var(--text3)', marginTop: 5 }}>EXPECTED PTS</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {weakestStroke && (
        <div className="pcd-rec-card">
          <div className="pcd-rec-top">
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="pcd-rec-tags">
                <span className="pcd-rec-tag" style={{ background: 'rgba(79,195,232,.14)', color: 'var(--info)' }}>TRAINING FOCUS</span>
                <span className="pcd-rec-priority">PRIORITY 2</span>
              </div>
              <div className="pcd-rec-title">{weakestStroke.stroke} is your weakest tracked shot</div>
              <div className="pcd-rec-why">
                {weakestStroke.winRate}% win rate across {weakestStroke.total} tracked points this segment — log some {weakestStroke.stroke.toLowerCase()} drills in the Training tab and see if it moves.
              </div>
            </div>
          </div>
          {coachLink && (
            <div className="pcd-rec-section">
              <div className="pcd-rec-section-label">From your coach's library</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {placeholderDrills(weakestStroke.stroke).map(d => (
                  <div key={d.name} className="pcd-drill-chip">
                    <div style={{ font: "600 13px/1.2 'Archivo', sans-serif" }}>{d.name}</div>
                    <div style={{ font: "400 11px/1.3 'IBM Plex Mono', monospace", color: 'var(--text2)', marginTop: 7 }}>{d.meta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pcd-rec-card">
        <div className="pcd-rec-top">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="pcd-rec-tags">
              <span className="pcd-rec-tag" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>TOURNAMENT PACE</span>
              <span className="pcd-rec-priority">PRIORITY 3</span>
            </div>
            <div className="pcd-rec-title">{recentEntries90d} {circuit.category} {circuit.subcategory} entr{recentEntries90d === 1 ? 'y' : 'ies'} in the last 90 days</div>
            <div className="pcd-rec-why">
              {recentEntries90d === 0
                ? 'No recent entries in this segment — ranking points only come from tournaments you actually enter, so consider signing up for one.'
                : 'Keep entering regularly — rankings in this segment only reflect the events you actually play.'}
            </div>
          </div>
        </div>
      </div>

      {!weakestStroke && tracked.length === 0 && (
        <div className="history-empty">Track a few matches in this segment to unlock training-focus recommendations.</div>
      )}
    </div>
  );
}
