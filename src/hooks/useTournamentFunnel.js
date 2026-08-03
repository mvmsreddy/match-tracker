import { useEffect, useState } from 'react';
import * as api from '../api';
import { normalizeEventSegment } from '../lib/governingBodies';
import { roundToken } from '../utils/aitaGradeRules';

const STAGE_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'W'];
const STAGE_LABELS = {
  R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarterfinal', SF: 'Semifinal', W: 'Final',
};

// All-time (no season split) tournament progression funnel for the selected
// segment, built from real bracket results (draw_entries + event_matches) —
// not the free-text round field on self-tracked matches, since round-by-
// round progression is entered by tournament organisers running an official
// draw, not by the point-by-point tracker. Each stage's `played`/`won`
// counts every complete bracket match at that stage across every entry in
// this segment. `roundToken` is always called with won=true so the final
// round always resolves to a single 'W' bucket (it only branches to 'F' for
// a lost final) — that gives one "played the final" bucket instead of
// splitting winners/runners-up into separate buckets.
export function useTournamentFunnel(playerId, circuit) {
  const [state, setState] = useState({ loading: true, error: '', totalEntries: 0, stages: [] });

  useEffect(() => {
    if (!playerId || !circuit) return;
    let cancelled = false;
    setState({ loading: true, error: '', totalEntries: 0, stages: [] });

    (async () => {
      try {
        const entries = await api.getMyEntries(playerId);
        const segmentEntries = entries.filter(e => e.event).filter(e => {
          const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
          return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
        });

        const played = Object.fromEntries(STAGE_ORDER.map(s => [s, 0]));
        const won = Object.fromEntries(STAGE_ORDER.map(s => [s, 0]));

        await Promise.all(segmentEntries.map(async (entry) => {
          const matches = await api.getEventMatches(entry.eventId, entry.drawType);
          const own = matches.filter(m =>
            (m.entry1Id === entry.id || m.entry2Id === entry.id) && m.status === 'complete'
          );
          for (const m of own) {
            const didWin = m.winnerEntryId === entry.id;
            const token = roundToken(m.round, entry.event.drawSize, true);
            if (!token || played[token] == null) continue;
            played[token]++;
            if (didWin) won[token]++;
          }
        }));

        if (cancelled) return;

        const stages = STAGE_ORDER
          .filter(token => played[token] > 0)
          .map(token => ({ token, label: STAGE_LABELS[token], won: won[token], played: played[token] }));

        setState({ loading: false, error: '', totalEntries: segmentEntries.length, stages });
      } catch (e) {
        if (!cancelled) {
          setState({ loading: false, error: e.message || 'Could not load tournament progression', totalEntries: 0, stages: [] });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [playerId, circuit?.key]);

  return state;
}
