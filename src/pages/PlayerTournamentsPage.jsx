import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSegment } from '../context/SegmentContext';
import * as api from '../api';
import { useMyTournaments } from '../hooks/useMyTournaments';
import { usePlayerProfileReadiness } from '../hooks/usePlayerProfileReadiness';
import { segmentKeysForTournamentItem } from '../lib/segmentOverview';
import { normalizeEventSegment } from '../lib/governingBodies';
import PlayerParticipationCard from '../components/player/PlayerParticipationCard';
import TournamentCalendarBrowser from '../components/tournaments/TournamentCalendarBrowser';
import MatchDetailModal from '../components/player/MatchDetailModal';
import { cn } from '../lib/utils';

const hasSupabaseConfig = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

function EmptyState({ children }) {
  return (
    <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// Player tournament hub — "My Tournaments" (unified interest + entries) and
// "Browse" (shared calendar). One status model via useMyTournaments.
export default function PlayerTournamentsPage() {
  const { user } = useAuth();
  const { circuits } = useSegment();
  const profile = usePlayerProfileReadiness(user);
  const myTournaments = useMyTournaments(user?.id, { aitaReg: user?.aitaReg });

  const [tab, setTab] = useState('mine');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [openKey, setOpenKey] = useState(null);
  const [trackedByEventMatch, setTrackedByEventMatch] = useState(new Map());
  const [modalMatch, setModalMatch] = useState(null);

  const filteredItems = useMemo(() => {
    if (segmentFilter === 'all') return myTournaments.items;
    return myTournaments.items.filter(item => segmentKeysForTournamentItem(item).has(segmentFilter));
  }, [myTournaments.items, segmentFilter]);

  useEffect(() => {
    if (!user?.id || myTournaments.tournaments.length === 0) {
      setTrackedByEventMatch(new Map());
      return;
    }
    const segments = new Map();
    for (const { events } of myTournaments.tournaments) {
      for (const { event } of events) {
        const seg = normalizeEventSegment(event.category, event.ageGroup);
        if (seg) segments.set(`${seg.category}|${seg.subcategory}`, seg);
      }
    }
    let cancelled = false;
    Promise.all(
      [...segments.values()].map(seg => api.getMatchesForSegment(user.id, seg.category, seg.subcategory).catch(() => []))
    ).then(results => {
      if (cancelled) return;
      const map = new Map();
      for (const list of results) {
        for (const m of list) {
          if (m.eventMatchId && m.points?.length > 0) map.set(m.eventMatchId, m);
        }
      }
      setTrackedByEventMatch(map);
    });
    return () => { cancelled = true; };
  }, [user?.id, myTournaments.tournaments]);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Live Events &amp; Draw Tracker</div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Events</h1>
      </div>

      {!hasSupabaseConfig && (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm px-3 py-2.5">
          Demo mode — tournament participation and entry require Supabase. Browse uses local mock data only.
        </div>
      )}

      {profile.message && (
        <div className="rounded-sm border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2.5 flex items-center gap-2.5">
          <span className="text-lg">⚠</span>
          <span>
            {profile.message}{' '}
            <Link to="/profile" className="underline">Update Profile →</Link>
          </span>
        </div>
      )}

      <div className="inline-flex gap-1 border border-border rounded-sm p-1 bg-card">
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={cn(
            'px-4 py-2 rounded-sm text-sm font-semibold transition-colors',
            tab === 'mine' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          My Events
        </button>
        <button
          type="button"
          onClick={() => setTab('browse')}
          className={cn(
            'px-4 py-2 rounded-sm text-sm font-semibold transition-colors',
            tab === 'browse' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Browse Calendar
        </button>
      </div>

      {tab === 'mine' && circuits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSegmentFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              segmentFilter === 'all'
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            All segments
          </button>
          {circuits.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSegmentFilter(c.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                segmentFilter === c.key
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {c.subcategory}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' && (
        <section className="space-y-3">
          {myTournaments.loading && <EmptyState>Loading your tournaments…</EmptyState>}
          {!myTournaments.loading && myTournaments.error && <EmptyState>{myTournaments.error}</EmptyState>}
          {!myTournaments.loading && !myTournaments.error && !myTournaments.hasAny && (
            <EmptyState>
              Not in any tournaments yet —{' '}
              <button type="button" className="text-accent-ink font-semibold hover:underline" onClick={() => setTab('browse')}>
                browse the calendar
              </button>{' '}
              to find one.
            </EmptyState>
          )}

          {!myTournaments.loading && !myTournaments.error && myTournaments.hasAny && filteredItems.length === 0 && (
            <EmptyState>No events in this segment yet — try another filter or browse the calendar.</EmptyState>
          )}

          {!myTournaments.loading && !myTournaments.error && filteredItems.length > 0 && (
            <div className="space-y-2.5">
              {filteredItems.map(item => (
                <PlayerParticipationCard
                  key={item.key}
                  item={item}
                  expanded={openKey === item.key}
                  onToggle={item.entries.length > 0 ? () => setOpenKey(openKey === item.key ? null : item.key) : undefined}
                  trackedByEventMatch={trackedByEventMatch}
                  onOpenMatch={setModalMatch}
                  isOwnDashboard
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'browse' && (
        <section className="space-y-3">
          <TournamentCalendarBrowser />
        </section>
      )}

      {modalMatch && (
        <MatchDetailModal match={modalMatch} selfName={user?.displayName || user?.name || 'You'} onClose={() => setModalMatch(null)} />
      )}
    </div>
  );
}
