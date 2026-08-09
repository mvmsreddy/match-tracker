import { useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import {
  derivePlayerTournamentStatus,
  playerTournamentLink,
  PLAYER_TOURNAMENT_STATUS,
} from '../utils/tournamentStatus';

function weekKey(weekId) {
  return weekId ? `week:${weekId}` : null;
}

function interestKey(interest) {
  const t = interest?.tournament;
  if (!t) return null;
  if (t.linkedTournamentWeekId) return weekKey(t.linkedTournamentWeekId);
  return `aita:${t.id}`;
}

function entryWeekId(entry) {
  return entry.event?.week?.id || null;
}

// Single source of truth for "My Tournaments" — merges aita_participation_interest
// with draw_entries (getMyEntries) so interest survives the claim/publish bridge
// until a real entry exists.
export function useMyTournaments(playerId, { aitaReg } = {}) {
  const [entries, setEntries] = useState(null);
  const [interest, setInterest] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) {
      setEntries([]);
      setInterest([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      api.getMyEntries(playerId),
      api.getMyAitaParticipation().catch(() => []),
    ])
      .then(([entryRows, interestRows]) => {
        if (cancelled) return;
        setEntries(entryRows);
        setInterest(interestRows);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || 'Could not load your tournaments');
        setEntries([]);
        setInterest([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [playerId]);

  const items = useMemo(() => {
    if (entries === null || interest === null) return [];

    const map = new Map();

    for (const entry of entries) {
      const week = entry.event?.week;
      const wkId = entryWeekId(entry);
      if (!wkId) continue;
      const key = weekKey(wkId);
      if (!map.has(key)) {
        map.set(key, {
          key,
          kind: 'week',
          week,
          interest: null,
          entries: [],
        });
      }
      map.get(key).entries.push({ event: entry.event, entry });
    }

    for (const row of interest) {
      if (row.status !== 'declared') continue;
      const key = interestKey(row);
      if (!key) continue;

      const linkedWeekId = row.tournament?.linkedTournamentWeekId;
      const existing = map.get(key);

      if (existing) {
        existing.interest = row;
        continue;
      }

      // Skip interest when we already have entries for the linked week
      if (linkedWeekId && map.has(weekKey(linkedWeekId))) {
        const linked = map.get(weekKey(linkedWeekId));
        linked.interest = row;
        continue;
      }

      map.set(key, {
        key,
        kind: linkedWeekId ? 'pending' : 'interest',
        week: linkedWeekId ? { id: linkedWeekId, name: row.tournament?.name, startDate: row.tournament?.startDate, city: row.tournament?.city, location: row.tournament?.venue } : null,
        interest: row,
        entries: [],
      });
    }

    const list = [...map.values()].map(row => {
      const statusInfo = derivePlayerTournamentStatus(row);
      const name = row.week?.name || row.interest?.tournament?.name || 'Tournament';
      const startDate = row.week?.startDate || row.interest?.tournament?.startDate;
      return {
        ...row,
        name,
        startDate,
        status: statusInfo.status,
        badge: statusInfo,
        linkTo: playerTournamentLink(row),
        showDrawUpload: statusInfo.status === PLAYER_TOURNAMENT_STATUS.TRACKING,
        showEnterCta: statusInfo.status === PLAYER_TOURNAMENT_STATUS.PENDING_ENTRY,
      };
    });

    list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    return list;
  }, [entries, interest]);

  // Back-compat shape for useTournamentActivity consumers — week-grouped entries
  const tournaments = useMemo(() => {
    const weekMap = new Map();
    for (const item of items) {
      if (item.entries.length === 0) continue;
      const wkId = item.week?.id;
      if (!wkId) continue;
      if (!weekMap.has(wkId)) {
        weekMap.set(wkId, { week: item.week, events: [] });
      }
      for (const ev of item.entries) {
        weekMap.get(wkId).events.push(ev);
      }
    }
    return [...weekMap.values()].sort(
      (a, b) => (b.week.startDate || '').localeCompare(a.week.startDate || '')
    );
  }, [items]);

  const reload = () => {
    if (!playerId) return;
    setLoading(true);
    Promise.all([
      api.getMyEntries(playerId),
      api.getMyAitaParticipation().catch(() => []),
    ])
      .then(([entryRows, interestRows]) => {
        setEntries(entryRows);
        setInterest(interestRows);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || 'Could not load your tournaments');
        setLoading(false);
      });
  };

  return {
    loading,
    error,
    items,
    entries: entries || [],
    interest: interest || [],
    tournaments,
    hasAny: items.length > 0,
    reload,
    aitaReg,
  };
}
