import { useEffect, useState } from 'react';
import * as api from '../api';

// Raw "my tournament entries" fetch — used to be an identical useEffect
// copy-pasted in OverviewTab and TournamentsTab. Returns the untagged list;
// each consumer keeps its own segment-filtering/sorting on top since that
// genuinely differs per tab (upcoming-only vs full history).
export function usePlayerTournamentEntries(playerId) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries(playerId)
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, [playerId]);

  return { entries, error };
}
