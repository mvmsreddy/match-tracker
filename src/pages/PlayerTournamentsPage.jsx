import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { useTournamentActivity } from '../hooks/useTournamentActivity';
import { normalizeEventSegment } from '../lib/governingBodies';
import { entryStatusBadge, declaredTournamentStatus } from '../utils/tournamentStatus';
import TournamentMatches from '../components/tournaments/TournamentMatches';
import TournamentCalendarBrowser from '../components/tournaments/TournamentCalendarBrowser';
import { DrawSheetUploader } from '../components/player/MyAitaParticipationCard';
import MatchDetailModal from '../components/player/MatchDetailModal';
import { Card } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';

function EmptyState({ children }) {
  return (
    <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// A player's Tournament screen — everything scoped to *this* player, unlike
// the organizer's TournamentsListPage which lists tournaments they host.
// "My Tournaments" reuses the same status logic as the Dashboard's compact
// summary (useTournamentActivity + entryStatusBadge/declaredTournamentStatus,
// see src/utils/tournamentStatus.js) so the two never disagree, but expands
// each entry into its match list (TournamentMatches) so a player can track a
// live match right from this screen. "Browse & Enroll" is the same merged
// AITA + organizer-hosted calendar used on the full Tournament Calendar page.
export default function PlayerTournamentsPage() {
  const { user } = useAuth();
  const [declaredOnly, setDeclaredOnly] = useState([]);
  const [trackedByEventMatch, setTrackedByEventMatch] = useState(new Map());
  const [openWeekId, setOpenWeekId] = useState(null);
  const [modalMatch, setModalMatch] = useState(null);

  const activity = useTournamentActivity(user?.aitaReg ? [user.aitaReg] : []);

  useEffect(() => {
    let cancelled = false;
    api.getMyAitaParticipation()
      .then(data => { if (!cancelled) setDeclaredOnly(data.filter(r => !r.tournament?.linkedTournamentWeekId)); })
      .catch(() => { if (!cancelled) setDeclaredOnly([]); });
    return () => { cancelled = true; };
  }, []);

  // TournamentMatches needs to know which matches already have full
  // point-by-point tracking (vs. score-only) — getMatchesForSegment is
  // per-circuit, so gather every circuit this player's entries touch and
  // merge the results, same source of truth TournamentsTab uses per-circuit
  // on the dashboard.
  useEffect(() => {
    if (!user?.id || activity.tournaments.length === 0) { setTrackedByEventMatch(new Map()); return; }
    const segments = new Map();
    for (const { events } of activity.tournaments) {
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
  }, [user?.id, activity.tournaments]);

  const missingPlayerFields = [!user?.aitaReg && 'AITA Reg', !user?.dateOfBirth && 'Date of Birth', !user?.stateAbbr && 'State'].filter(Boolean);
  const hasAny = activity.tournaments.length > 0 || declaredOnly.length > 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-8">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Live Events &amp; Draw Tracker</div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">Tournaments</h1>
      </div>

      {missingPlayerFields.length > 0 && (
        <div className="rounded-sm border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2.5 flex items-center gap-2.5">
          <span className="text-lg">⚠</span>
          <span>
            Complete your profile to enter tournaments — missing: <strong>{missingPlayerFields.join(', ')}</strong>.{' '}
            <Link to="/profile" className="underline">Update Profile →</Link>
          </span>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">My Tournaments</h2>

        {activity.loading && <EmptyState>Loading your tournaments…</EmptyState>}
        {!activity.loading && activity.error && <EmptyState>{activity.error}</EmptyState>}
        {!activity.loading && !activity.error && !hasAny && (
          <EmptyState>Not entered in any tournaments yet — browse the calendar below to find one.</EmptyState>
        )}

        {!activity.loading && !activity.error && hasAny && (
          <div className="space-y-2.5">
            {activity.tournaments.map(({ week, events }) => {
              const isLive = events.some(({ event }) => event.status === 'in_progress');
              const isOpen = openWeekId === week.id;
              return (
                <div key={week.id} className="rounded-sm border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setOpenWeekId(isOpen ? null : week.id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50"
                  >
                    <div className="text-muted-foreground shrink-0">{isOpen ? '▾' : '▸'}</div>
                    <div className="flex-1 min-w-48">
                      <div className="text-sm font-bold">{week.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {[week.location, week.city, week.startDate].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {isLive && <Badge variant="destructive">Live</Badge>}
                    <Link
                      to={`/tournaments/${week.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-semibold text-accent-ink hover:underline shrink-0"
                    >
                      Tournament page →
                    </Link>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-border space-y-3">
                      {events.map(({ event, entry }) => {
                        const status = entryStatusBadge(entry);
                        const circuit = normalizeEventSegment(event.category, event.ageGroup) || { category: event.category, subcategory: event.ageGroup };
                        return (
                          <div key={entry.id} className="pt-2">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="font-semibold">{event.ageGroup} {event.category}</span>
                              <span className={`rounded-sm px-1.5 py-0.5 text-[0.68rem] font-semibold ${status.className}`}>{status.label}</span>
                            </div>
                            <TournamentMatches
                              entry={entry}
                              circuit={circuit}
                              trackedByEventMatch={trackedByEventMatch}
                              onOpenMatch={setModalMatch}
                              isOwnDashboard
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {declaredOnly.map(r => {
              const t = r.tournament;
              if (!t) return null;
              const status = declaredTournamentStatus(t);
              return (
                <Card key={r.id} className="p-3 space-y-2">
                  <Link to={`/aita-calendar/${t.id}`} className="text-sm font-bold hover:text-accent-ink">{t.name}</Link>
                  <div className="text-xs text-muted-foreground -mt-1.5">
                    {[r.selectedAgeGroup || t.ageGroup, r.selectedCategory || t.category, t.grade].filter(Boolean).join(' · ')}
                    {(t.ageGroup || t.category || t.grade) && (t.venue || t.city || t.startDate) ? ' · ' : ''}
                    {[t.venue, t.city, t.startDate].filter(Boolean).join(' · ')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{status.label}</Badge>
                    <DrawSheetUploader aitaTournamentId={t.id} ctaLabel={status.ctaLabel} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Browse &amp; Enroll</h2>
        <TournamentCalendarBrowser />
      </section>

      {modalMatch && (
        <MatchDetailModal match={modalMatch} selfName={user?.displayName || user?.name || 'You'} onClose={() => setModalMatch(null)} />
      )}
    </div>
  );
}
