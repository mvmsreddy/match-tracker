import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import * as api from '../api';
import { computeSkillGroups } from '../lib/coachAnalytics';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';

// Skill groups — computed fresh from every linked player's real tracked
// matches (src/lib/coachAnalytics.js), never a stored roll-up table. A
// player joins a group when a tracked stroke's win rate sits below 50%
// across at least 4 tracked matches in that segment.
export default function CoachSkillGroupsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getRosterWithSegments(user.id)
      .then(roster => computeSkillGroups(roster))
      .then(data => { if (!cancelled) setGroups(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not compute skill groups'); setGroups([]); } })
      ;
    return () => { cancelled = true; };
  }, [user.id]);

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="roster" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <h1 className="title">Skill Groups</h1>
            <div className="subtitle">Roster segmented by the gap the match data actually shows</div>
          </div>
          <Link to="/my-players" className="action-btn">← Roster</Link>
        </div>
      </div>

      <div className="page-scroll">
        {error && <div className="history-empty">{error}</div>}
        {groups === null && !error && <div className="history-empty">Computing skill groups from tracked matches…</div>}
        {groups !== null && groups.length === 0 && (
          <div className="history-empty">
            No skill gaps found yet — this needs at least 4 tracked matches per player per segment. Ask players to use "Track this match" from their Tournaments tab.
          </div>
        )}

        {groups !== null && groups.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
            {groups.map((g, idx) => (
              <div key={idx} className="perf-chart-card" style={{ borderTop: '3px solid var(--opp)', margin: 0 }}>
                <div style={{ font: '500 10px/1 monospace', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--opp)' }}>
                  {g.category} {g.subcategory}
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, marginTop: 12 }}>{g.stroke} weakness</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{g.members.length} player{g.members.length === 1 ? '' : 's'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
                  {g.members.map(m => (
                    <Link
                      key={m.playerId}
                      to={`/coach/players/${m.playerId}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 9, background: 'var(--bg3)', color: 'inherit' }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>#{m.rank}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--opp)' }}>{m.winRate}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
