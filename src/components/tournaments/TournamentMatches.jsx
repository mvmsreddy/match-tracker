import { useEffect, useState } from 'react';
import * as api from '../../api';
import { roundToken } from '../../utils/aitaGradeRules';
import LogMatchButton from './LogMatchButton';
import { Badge } from '@/components/primitives/badge';

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function entryName(entry) {
  if (!entry) return 'TBD';
  if (entry.isBye) return 'BYE';
  return `${entry.familyName}${entry.firstName ? ', ' + entry.firstName : ''}`;
}

// Expandable per-tournament match list — matches by round, each with a
// "Track this match" button for untracked rounds, or opens the caller's
// match-detail view (via onOpenMatch) for completed rounds. Shared by the
// player dashboard's segment-scoped TournamentsTab and the full player
// Tournament screen so match tracking behaves identically in both places.
// Opponent resolution (a second fetch, getDrawEntries) only happens for a
// tournament the player actually opens.
export default function TournamentMatches({ entry, circuit, trackedByEventMatch, onOpenMatch, isOwnDashboard }) {
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
              <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold shrink-0 ${won ? 'bg-primary/10 text-accent-ink' : 'bg-destructive/10 text-destructive'}`}>{won ? 'W' : 'L'}</span>
              <div className="flex-1 min-w-32 text-sm font-semibold">{opponentName}</div>
              <div className={`text-sm font-bold shrink-0 ${won ? 'text-accent-ink' : 'text-destructive'}`}>{m.score || '—'}</div>
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
