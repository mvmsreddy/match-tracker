import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api';
import { computeCrossSegmentSuggestions } from '../../lib/coachingSuggestions';

// Phase 7 — cross-segment coaching suggestions. Only renders for players
// active in 2+ segments at once; every suggestion compares that ONE
// player's own stroke win rates between their own segments, never a
// cross-player or cross-segment point/rank comparison.
export default function CoachingSuggestionsPanel() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getRosterWithSegments(user.id)
      .then(roster => computeCrossSegmentSuggestions(roster))
      .then(data => { if (!cancelled) setSuggestions(data); })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [user.id]);

  if (suggestions === null) return null;
  if (suggestions.length === 0) return null;

  return (
    <div className="perf-chart-card" style={{ borderLeft: '3px solid var(--info)' }}>
      <div className="perf-chart-title">Cross-segment coaching suggestions</div>
      <div className="perf-chart-subtitle">Same player, compared across their own segments — never a points/rank transfer</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' }}>
        {suggestions.slice(0, 5).map((s, idx) => (
          <div key={idx} style={{ padding: 14, borderRadius: 11, background: 'var(--bg3)' }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{s.text}</div>
            <Link to={`/coach/players/${s.playerId}`} style={{ fontSize: 11, marginTop: 8, display: 'inline-block' }}>View {s.playerName}'s dashboard →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
