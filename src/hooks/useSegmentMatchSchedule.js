import { useEffect, useState } from 'react';
import * as api from '../api';
import { normalizeEventSegment } from '../lib/governingBodies';
import { roundToken } from '../utils/aitaGradeRules';

function entryName(entry) {
  if (!entry) return 'TBD';
  if (entry.isBye) return 'BYE';
  return `${entry.familyName}${entry.firstName ? ', ' + entry.firstName : ''}`;
}

function addDays(iso, n) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Most tournament entries this hook will eagerly resolve into per-match rows —
// bounds the getEventMatches/getDrawEntries fan-out for players with a long history.
const MAX_ENTRIES = 12;

// Resolves a segment's tournament entries into real per-match upcoming/recent rows,
// reusing the exact per-entry fetch pattern TournamentsTab.jsx's TournamentMatches
// already uses (api.getEventMatches + api.getDrawEntries), just eagerly across every
// (capped, most-recent-first) entry in the segment instead of on-demand per accordion
// row. Cross-references each completed match's event_match_id against
// api.getMatchesForSegment so the Overview tab can show a real tracked/"official score
// only" distinction and open the match-detail modal with real per-match analytics.
export function useSegmentMatchSchedule(userId, circuit) {
  const [state, setState] = useState({ loading: true, error: '', upcoming: [], recent: [] });

  useEffect(() => {
    if (!userId || !circuit) return;
    let cancelled = false;
    setState({ loading: true, error: '', upcoming: [], recent: [] });

    (async () => {
      try {
        const [entries, trackedMatches] = await Promise.all([
          api.getMyEntries(),
          api.getMatchesForSegment(userId, circuit.category, circuit.subcategory),
        ]);

        const trackedByEventMatch = new Map(
          trackedMatches.filter(m => m.eventMatchId && m.points?.length > 0).map(m => [m.eventMatchId, m])
        );

        const segmentEntries = entries
          .filter(e => e.event)
          .filter(e => {
            const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
            return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
          })
          .slice(0, MAX_ENTRIES);

        const resolved = await Promise.all(segmentEntries.map(async (entry) => {
          const [matches, drawEntries] = await Promise.all([
            api.getEventMatches(entry.eventId, entry.drawType),
            api.getDrawEntries(entry.eventId, entry.drawType),
          ]);
          const entryMap = new Map(drawEntries.map(e => [e.id, e]));
          const own = matches.filter(m => m.entry1Id === entry.id || m.entry2Id === entry.id);
          return own.map(m => {
            const oppId = m.entry1Id === entry.id ? m.entry2Id : m.entry1Id;
            const opponent = entryMap.get(oppId);
            const won = m.status === 'complete' && m.winnerEntryId === entry.id;
            const round = roundToken(m.round, entry.event.drawSize, won);
            const date = m.dayNumber ? addDays(entry.event.week?.startDate, m.dayNumber - 1) : entry.event.week?.startDate;
            const tracked = trackedByEventMatch.get(m.id) || null;
            return {
              id: m.id,
              tournamentName: entry.event.week?.name || 'Tournament',
              opponentName: entryName(opponent),
              round,
              date,
              hasDay: m.dayNumber != null,
              score: m.score || null,
              status: m.status,
              won,
              grade: entry.event.week?.grade || null,
              tracked: !!tracked,
              trackedMatch: tracked,
            };
          });
        }));

        if (cancelled) return;
        const all = resolved.flat();
        const today = new Date().toISOString().slice(0, 10);

        const recent = all
          .filter(m => m.status === 'complete')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const upcoming = all
          .filter(m => m.status !== 'complete')
          .sort((a, b) => (a.date || today).localeCompare(b.date || today));

        // Real head-to-head count for upcoming rows — past completed matches
        // (any tournament, not just this segment's own recent list) against the
        // same opponent name. Zero prior meetings shows as "First meeting", not
        // a fabricated ratio.
        const upcomingWithH2H = upcoming.map(m => {
          const priorWins = recent.filter(r => r.opponentName === m.opponentName && r.won).length;
          const priorLosses = recent.filter(r => r.opponentName === m.opponentName && !r.won).length;
          return { ...m, h2h: priorWins + priorLosses > 0 ? `H2H ${priorWins}-${priorLosses}` : null };
        });

        setState({ loading: false, error: '', upcoming: upcomingWithH2H, recent });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e.message || 'Could not load match schedule', upcoming: [], recent: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [userId, circuit?.key]);

  return state;
}
