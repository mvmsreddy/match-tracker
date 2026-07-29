import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';
import { roundToken } from '../../utils/aitaGradeRules';
import LogMatchButton from '../tournaments/LogMatchButton';
import MatchDetailModal from './MatchDetailModal';
import { Badge } from '@/components/primitives/badge';

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
// "Track this match" button for untracked rounds, or opens MatchDetailModal
// (real per-match analytics) for completed rounds. Kept separate from the
// entries list above so opponent resolution (a second fetch, getDrawEntries)
// only happens for a tournament the player actually opens.
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

  if (matches === null) return <div className="text-sm text-muted-foreground py-2">Loading matches…</div>;
  if (matches.length === 0) return <div className="text-sm text-muted-foreground py-2">No matches recorded yet for this entry.</div>;

  return (
    <div className="space-y-2 py-2">
      {matches.map(m => {
        const opp = entryMap.get(m.entry1Id === entry.id ? m.entry2Id : m.entry1Id);
        const won = m.status === 'complete' && m.winnerEntryId === entry.id;
        const complete = m.status === 'complete';
        const round = roundToken(m.round, entry.event.drawSize, won) || `R${m.round}`;
        const tracked = trackedByEventMatch.get(m.id) || null;
        const opponentName = entryName(opp);

        if (complete) {
          return (
            <button
              key={m.id}
              className="w-full flex flex-wrap items-center gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary text-left"
              onClick={() => onOpenMatch({
                opponentName, tournamentName: entry.event.week?.name, round, grade: entry.event.week?.grade,
                date: entry.event.week?.startDate, score: m.score, won, tracked: !!tracked, trackedMatch: tracked,
              })}
            >
              <div className="text-xs text-muted-foreground w-12 shrink-0">{round}</div>
              <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold shrink-0 ${won ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{won ? 'W' : 'L'}</span>
              <div className="flex-1 min-w-32 text-sm font-semibold">{opponentName}</div>
              <div className={`text-sm font-bold shrink-0 ${won ? 'text-primary' : 'text-destructive'}`}>{m.score || '—'}</div>
              <div className="text-xs text-muted-foreground shrink-0">{formatDate(entry.event.week?.startDate)}</div>
              <Badge variant={tracked ? 'default' : 'secondary'} className="shrink-0">{tracked ? 'Full stats' : 'Score only'}</Badge>
            </button>
          );
        }
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-3 rounded-sm bg-secondary/50">
            <div className="text-xs text-muted-foreground w-12 shrink-0">{round}</div>
            <div className="flex-1 min-w-32 text-sm font-semibold">{opponentName}</div>
            <div className="text-xs text-muted-foreground">{m.status || 'scheduled'}</div>
            {isOwnDashboard && (
              <LogMatchButton
                match={m}
                opponentName={opponentName}
                tournamentName={entry.event?.week?.name}
                date={entry.event?.week?.startDate}
                round={round}
                category={circuit.category}
                subcategory={circuit.subcategory}
                className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Segment-filtered tournament history. Each entry expands to its matches
// (fetched on demand) rather than eagerly loading every entry's matches up
// front.
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
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{segmentEntries.length} {circuit.category} {circuit.subcategory} entr{segmentEntries.length === 1 ? 'y' : 'ies'}</div>

      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {entries === null && !error && <div className="text-sm text-muted-foreground">Loading…</div>}
      {entries !== null && segmentEntries.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
          No {circuit.category} {circuit.subcategory} tournament entries found yet.
        </div>
      )}

      {segmentEntries.map(e => (
        <div key={e.id} className="rounded-sm border border-border bg-card overflow-hidden">
          <button
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50"
          >
            <div className="text-muted-foreground shrink-0">{openId === e.id ? '▾' : '▸'}</div>
            <div className="flex-1 min-w-48">
              <div className="text-sm font-bold">{e.event.week?.name || 'Unnamed tournament'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatDate(e.event.week?.startDate)} &middot; {e.event.week?.city}, {e.event.week?.stateAbbr} &middot; {e.event.week?.grade}
              </div>
            </div>
            {e.seed && <Badge variant="secondary">Seed {e.seed}</Badge>}
            <div className="text-xs text-muted-foreground shrink-0">{e.drawType === 'doubles' ? 'Doubles' : 'Singles'}</div>
          </button>
          {openId === e.id && (
            <div className="px-3 pb-3 border-t border-border">
              <TournamentMatches entry={e} circuit={circuit} trackedByEventMatch={trackedByEventMatch} onOpenMatch={setModalMatch} isOwnDashboard={isOwnDashboard} />
            </div>
          )}
        </div>
      ))}

      <Link to="/tournaments" className="inline-block text-sm font-semibold text-primary hover:underline">Browse the full tournament calendar &rarr;</Link>

      {modalMatch && <MatchDetailModal match={modalMatch} selfName={selfName} onClose={() => setModalMatch(null)} />}
    </div>
  );
}
