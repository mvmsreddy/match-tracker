import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import LogMatchButton from '../tournaments/LogMatchButton';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function entryName(entry) {
  if (!entry) return 'TBD';
  if (entry.isBye) return 'BYE';
  return `${entry.familyName}${entry.firstName ? ', ' + entry.firstName : ''}`;
}

// Expandable per-tournament match list — matches by round, each with a
// "Track this match" button (Phase 4). Kept separate from the entries list
// above so opponent resolution (a second fetch, getDrawEntries) only happens
// for a tournament the player actually opens, not for every entry up front.
function TournamentMatches({ entry, circuit }) {
  const [matches, setMatches] = useState(null);
  const [entryMap, setEntryMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getEventMatches(entry.eventId, entry.drawType),
      api.getDrawEntries(entry.eventId, entry.drawType),
    ]).then(([matchRows, entryRows]) => {
      if (cancelled) return;
      setMatches(matchRows.filter(m => m.entry1Id === entry.id || m.entry2Id === entry.id));
      setEntryMap(new Map(entryRows.map(e => [e.id, e])));
    }).catch(() => { if (!cancelled) { setMatches([]); setEntryMap(new Map()); } });
    return () => { cancelled = true; };
  }, [entry.eventId, entry.drawType, entry.id]);

  if (matches === null) return <div className="history-empty">Loading matches…</div>;
  if (matches.length === 0) return <div className="history-empty">No matches recorded yet for this entry.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
      {matches.map(m => {
        const opp = entryMap.get(m.entry1Id === entry.id ? m.entry2Id : m.entry1Id);
        const won = m.winnerEntryId === entry.id;
        return (
          <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg3)' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', width: 80 }}>{m.round}</div>
            <div style={{ flex: 1, minWidth: 160, fontWeight: 600 }}>{entryName(opp)}</div>
            {m.score && <div style={{ fontFamily: 'monospace', fontSize: 13, color: won ? 'var(--win-text)' : 'var(--opp)' }}>{m.score}</div>}
            {m.status !== 'complete' && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.status || 'scheduled'}</div>}
            <LogMatchButton
              match={m}
              opponentName={entryName(opp)}
              tournamentName={entry.event?.week?.name}
              date={entry.event?.week?.startDate}
              round={m.round}
              category={circuit.category}
              subcategory={circuit.subcategory}
              className="action-btn"
            />
          </div>
        );
      })}
    </div>
  );
}

// Segment-filtered tournament history. Each entry expands to its matches
// (fetched on demand) rather than eagerly loading every entry's matches up
// front — the entries list itself is the fast path, matching this design's
// intent of scanning a season at a glance before drilling into one event.
export default function TournamentsTab({ circuit }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, []);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter(e => e.event)
      .filter(e => {
        const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
        return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
      })
      .sort((a, b) => (b.event.week?.startDate || '').localeCompare(a.event.week?.startDate || ''));
  }, [entries, circuit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-info-item">{segmentEntries.length} {circuit.category} {circuit.subcategory} entr{segmentEntries.length === 1 ? 'y' : 'ies'}</div>

      {error && <div className="history-empty">{error}</div>}
      {entries === null && !error && <div className="history-empty">Loading…</div>}
      {entries !== null && segmentEntries.length === 0 && (
        <div className="history-empty">No {circuit.category} {circuit.subcategory} tournament entries found yet.</div>
      )}

      {segmentEntries.map(e => (
        <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <button
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
            style={{ width: '100%', border: 0, cursor: 'pointer', background: 'transparent', textAlign: 'left', padding: '20px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, color: 'inherit' }}
          >
            <div style={{ flex: 'none', width: 18, color: 'var(--text3)' }}>{openId === e.id ? '▾' : '▸'}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{e.event.week?.name || 'Unnamed tournament'}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 6 }}>
                {formatDate(e.event.week?.startDate)} · {e.event.week?.city}, {e.event.week?.stateAbbr} · {e.event.week?.grade}
              </div>
            </div>
            {e.seed && (
              <div style={{ fontSize: 11, fontWeight: 600, padding: '7px 10px', borderRadius: 7, background: 'rgba(79,195,232,.14)', color: 'var(--info)' }}>
                SEED {e.seed}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.drawType === 'doubles' ? 'Doubles' : 'Singles'}</div>
          </button>
          {openId === e.id && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '4px 22px' }}>
              <TournamentMatches entry={e} circuit={circuit} />
            </div>
          )}
        </div>
      ))}

      <Link to="/tournaments" className="dashboard-view-all">Browse the full tournament calendar →</Link>
    </div>
  );
}
