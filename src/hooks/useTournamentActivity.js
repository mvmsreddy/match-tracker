import { useEffect, useState } from 'react';
import * as api from '../api';

// day_number is a 1-based day index within a tournament week, not a calendar
// date — this converts it using the week's start_date.
function addDays(dateStr, n) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d;
}

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

// Cross-tournament activity for a player (pass [user.aitaReg]) or a coach's
// whole roster (pass each linked player's aitaReg). Reuses getWeekMatches
// (Phase 7) for schedule/results instead of a bespoke match query.
export function useTournamentActivity(aitaRegs) {
  const key = [...new Set((aitaRegs || []).filter(Boolean))].sort().join(',');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tournaments, setTournaments] = useState([]);
  const [todayMatches, setTodayMatches] = useState([]);
  const [recentResults, setRecentResults] = useState([]);

  useEffect(() => {
    const regs = key ? key.split(',') : [];
    if (regs.length === 0) {
      setLoading(false);
      setTournaments([]);
      setTodayMatches([]);
      setRecentResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    async function run() {
      try {
        const myEntries = await api.getDrawEntriesForPlayers(regs);
        if (cancelled) return;

        const entryIds = new Set(myEntries.map(e => e.id));
        const entryById = new Map(myEntries.map(e => [e.id, e]));

        // Group entries by tournament week
        const weekMap = new Map(); // weekId -> { week, events: [{ event, entry }] }
        for (const entry of myEntries) {
          const week = entry.event?.week;
          if (!week) continue;
          if (!weekMap.has(week.id)) weekMap.set(week.id, { week, events: [] });
          weekMap.get(week.id).events.push({ event: entry.event, entry });
        }
        const weekList = [...weekMap.values()].sort(
          (a, b) => (b.week.startDate || '').localeCompare(a.week.startDate || '')
        );

        // Reuse the existing per-week match query (Phase 7) — no new endpoint.
        const weekMatchesArr = await Promise.all(
          weekList.map(w => api.getWeekMatches(w.week.id).catch(() => []))
        );
        if (cancelled) return;

        const allMine = [];
        weekList.forEach((w, i) => {
          for (const m of weekMatchesArr[i] || []) {
            const e1Mine = entryIds.has(m.entry1Id);
            const e2Mine = entryIds.has(m.entry2Id);
            if (!e1Mine && !e2Mine) continue;
            const mineSide = e1Mine ? 'entry1' : 'entry2';
            const ownerEntry = entryById.get(e1Mine ? m.entry1Id : m.entry2Id);
            // Which input aitaReg this entry matched on (entrant or partner) —
            // used by the coach roster view to attribute a match to a player.
            const ownerAitaReg = regs.find(r => r === ownerEntry?.aitaReg || r === ownerEntry?.partnerAitaReg);
            allMine.push({ ...m, week: w.week, mineSide, ownerAitaReg });
          }
        });

        const today = [];
        const results = [];
        for (const m of allMine) {
          if (m.status === 'complete') results.push(m);
          if (m.dayNumber != null && isToday(addDays(m.week.startDate, m.dayNumber - 1))) {
            today.push(m);
          }
        }
        today.sort((a, b) => (a.courtNumber ?? 99) - (b.courtNumber ?? 99) || (a.matchOrder ?? 99) - (b.matchOrder ?? 99));
        results.sort((a, b) => b.round - a.round);

        if (!cancelled) {
          setTournaments(weekList);
          setTodayMatches(today);
          setRecentResults(results);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load tournament activity');
          setLoading(false);
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [key]);

  return { loading, error, tournaments, todayMatches, recentResults };
}
