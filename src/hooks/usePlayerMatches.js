import { useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import { buildComparisonRows } from '../lib/matchComparison';

// Shared "my saved matches + practices" data/state — used to be reimplemented
// independently in MyMatchesTab (dashboard) and ComparePage's "My Matches"
// mode. Works for both the logged-in player (playerId = own id) and a coach
// viewing a linked player (playerId = that player's id).
export function usePlayerMatches(playerId) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareDetails, setCompareDetails] = useState({});
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMatches(null);
    setError('');
    setSelectedIds([]);
    setCompareDetails({});
    api.listMatches(playerId)
      .then(list => { if (!cancelled) setMatches(list); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load match history'); setMatches([]); } });
    return () => { cancelled = true; };
  }, [playerId]);

  function toggleSelect(id) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  async function deleteMatch(matchId) {
    if (!window.confirm('Delete this saved match? This cannot be undone.')) return;
    await api.deleteMatch(playerId, matchId);
    setMatches(prev => prev.filter(m => m.id !== matchId));
    setSelectedIds(prev => prev.filter(id => id !== matchId));
  }

  async function loadComparison() {
    setComparing(true);
    setError('');
    try {
      const results = await Promise.all(selectedIds.map(id => api.getMatch(playerId, id)));
      const byId = {};
      results.forEach(m => { byId[m.id] = m; });
      setCompareDetails(byId);
    } catch (e) {
      setError(e.message || 'Could not load selected matches');
    } finally {
      setComparing(false);
    }
  }

  const selectedMatches = selectedIds.map(id => compareDetails[id]).filter(Boolean);
  const comparisonRows = useMemo(
    () => (selectedMatches.length > 0 ? buildComparisonRows(selectedMatches) : []),
    [selectedMatches]
  );

  return {
    matches, error, setError,
    selectedIds, toggleSelect,
    deleteMatch,
    comparing, loadComparison,
    selectedMatches, comparisonRows,
  };
}
