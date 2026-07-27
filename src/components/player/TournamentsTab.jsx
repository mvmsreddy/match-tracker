import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { roundToken } from '../../utils/aitaGradeRules';
import LogMatchButton from '../tournaments/LogMatchButton';
import MatchDetailModal from './MatchDetailModal';

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
// "Track this match" button (Phase 4) for untracked rounds, or opens
// MatchDetailModal (real per-match analytics) for completed rounds. Kept
// separate from the entries list above so opponent resolution (a second
// fetch, getDrawEntries) only happens for a tournament the player actually
// opens, not for every entry up front.
function TournamentMatches({ entry, circuit, trackedByEventMatch, onOpenMatch, isOwnDashboard }) {
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
    <div style={{ padding: '10px 0' }}>
      {matches.map(m => {
        const opp = entryMap.get(m.entry1Id === entry.id ? m.entry2Id : m.entry1Id);
        const won = m.status === 'complete' && m.winnerEntryId === entry.id;
        const complete = m.status === 'complete';
        const round = roundToken(m.round, entry.event.drawSize, won) || `R${m.round}`;
        const tracked = trackedByEventMatch.get(m.id) || null;
        const opponentName = entryName(opp);

        const row = complete ? (
          <button
            key={m.id}
            className="pcd-match-row"
            onClick={() => onOpenMatch({
              opponentName, tournamentName: entry.event.week?.name, round, grade: entry.event.week?.grade,
              date: entry.event.week?.startDate, score: m.score, won, tracked: !!tracked, trackedMatch: tracked,
            })}
          >
            <div className="pcd-match-round">{round}</div>
            <div className={`pcd-match-wl ${won ? 'win' : 'loss'}`}>{won ? 'W' : 'L'}</div>
            <div className="pcd-match-opp">{opponentName}</div>
            <div style={{ font: "600 13px/1 'IBM Plex Mono', monospace", color: won ? 'var(--accent)' : 'var(--opp)', whiteSpace: 'nowrap' }}>{m.score || '—'}</div>
            <div className="pcd-match-date">{formatDate(entry.event.week?.startDate)}</div>
            <span className={`pcd-badge sm pcd-match-tag ${tracked ? 'win' : ''}`}>{tracked ? 'FULL STATS' : 'SCORE ONLY'}</span>
          </button>
        ) : (
          <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg4)' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', width: 80 }}>{round}</div>
            <div style={{ flex: 1, minWidth: 160, fontWeight: 600 }}>{opponentName}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.status || 'scheduled'}</div>
            {isOwnDashboard && (
              <LogMatchButton
                match={m}
                opponentName={opponentName}
                tournamentName={entry.event?.week?.name}
                date={entry.event?.week?.startDate}
                round={round}
                category={circuit.category}
                subcategory={circuit.subcategory}
                className="pcd-btn-secondary"
              />
            )}
          </div>
        );
        return row;
      })}
    </div>
  );
}

// Segment-filtered tournament history. Each entry expands to its matches
// (fetched on demand) rather than eagerly loading every entry's matches up
// front — the entries list itself is the fast path, matching this design's
// intent of scanning a season at a glance before drilling into one event.
export default function TournamentsTab({ circuit, playerId, isOwnDashboard = true, selfName = 'You' }) {
  const [entries, setEntries] = useState(null);
  const [trackedMatches, setTrackedMatches] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [modalMatch, setModalMatch] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries(playerId)
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, [playerId]);

  useEffect(() => {
    let cancelled = false;
    api.getMatchesForSegment(playerId, circuit.category, circuit.subcategory)
      .then(data => { if (!cancelled) setTrackedMatches(data); })
      .catch(() => { if (!cancelled) setTrackedMatches([]); });
    return () => { cancelled = true; };
  }, [playerId, circuit.category, circuit.subcategory]);

  const trackedByEventMatch = useMemo(() => new Map(
    (trackedMatches || []).filter(m => m.eventMatchId && m.points?.length > 0).map(m => [m.eventMatchId, m])
  ), [trackedMatches]);

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
        <div key={e.id} className={`pcd-accordion${openId === e.id ? ' open' : ''}`}>
          <button
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
            className="pcd-accordion-head"
          >
            <div className="pcd-accordion-caret">{openId === e.id ? '▾' : '▸'}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ font: "700 16px/1.2 'Archivo', sans-serif" }}>{e.event.week?.name || 'Unnamed tournament'}</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 6 }}>
                {formatDate(e.event.week?.startDate)} · {e.event.week?.city}, {e.event.week?.stateAbbr} · {e.event.week?.grade}
              </div>
            </div>
            {e.seed && <span className="pcd-badge info">SEED {e.seed}</span>}
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.drawType === 'doubles' ? 'Doubles' : 'Singles'}</div>
          </button>
          {openId === e.id && (
            <div className="pcd-accordion-body">
              <TournamentMatches entry={e} circuit={circuit} trackedByEventMatch={trackedByEventMatch} onOpenMatch={setModalMatch} isOwnDashboard={isOwnDashboard} />
            </div>
          )}
        </div>
      ))}

      <Link to="/tournaments" className="dashboard-view-all">Browse the full tournament calendar →</Link>

      {modalMatch && <MatchDetailModal match={modalMatch} selfName={selfName} onClose={() => setModalMatch(null)} />}
    </div>
  );
}
