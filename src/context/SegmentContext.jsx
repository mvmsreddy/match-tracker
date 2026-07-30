import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import * as api from '../api';
import { findGoverningBody } from '../lib/governingBodies';
import { buildCircuits } from '../lib/segments';

const SegmentContext = createContext(null);

// Shared "which segment (AITA category/subcategory circuit) is the player
// currently looking at" state — the input every segment-scoped tab (Overview,
// Tournaments, Training, Match Analytics, Recommendations, Progress) needs,
// instead of each tab re-fetching ranking history and reimplementing its own
// picker. Modeled on AuthContext's provider/hook pattern. The selected segment
// is synced to a `segment` URL search param so links and the back button work
// as expected (an upgrade over PerformanceTab's original two bare useStates).
//
// Segments here are fully independent circuits (see src/lib/segments.js) —
// this context does not merge or roll up points across segments.
// `overrideAitaReg` lets a caller scope this provider to a DIFFERENT
// player's ranking history than the logged-in user's own — the Coach
// Intelligence System's "Dashboard →" link nests a second SegmentProvider
// instance with this set (to the linked player being viewed) around the
// real PlayerDashboardPage, rather than the app-wide provider that always
// reads the authenticated user. `useSegment()` inside every tab picks up
// whichever provider is nearest, so no prop drilling is needed for circuits.
export function SegmentProvider({ children, overrideAitaReg = null }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bodyId, setBodyId] = useState('AITA');
  const [history, setHistory] = useState(null); // null = loading
  const [error, setError] = useState('');

  const aitaReg = overrideAitaReg || user?.aitaReg;

  useEffect(() => {
    if (!aitaReg) { setHistory([]); return; }
    let cancelled = false;
    setHistory(null);
    setError('');
    api.getPlayerAitaRankingHistory(aitaReg)
      .then(data => { if (!cancelled) setHistory(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load ranking history'); setHistory([]); } });
    return () => { cancelled = true; };
  }, [aitaReg]);

  const circuits = useMemo(() => buildCircuits(history || []), [history]);

  const selectedKey = searchParams.get('segment') || null;
  function setSelectedKey(key) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (key) next.set('segment', key); else next.delete('segment');
      return next;
    }, { replace: true });
  }

  const selectedCircuit = selectedKey ? circuits.find(c => c.key === selectedKey) || null : null;
  const body = findGoverningBody(bodyId);

  const value = {
    bodyId, setBodyId, body,
    circuits, loading: history === null, error,
    selectedKey, setSelectedKey, selectedCircuit,
    rankingHistory: history || [],
  };

  return <SegmentContext.Provider value={value}>{children}</SegmentContext.Provider>;
}

export function useSegment() {
  const ctx = useContext(SegmentContext);
  if (!ctx) throw new Error('useSegment must be used within a SegmentProvider');
  return ctx;
}

// Non-throwing variant for components rendered EITHER inside or outside a
// SegmentProvider (e.g. motivation widgets that appear regardless of whether
// the player has an aitaReg). Returns null when outside.
export function useOptionalSegment() {
  return useContext(SegmentContext);
}
