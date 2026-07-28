import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { useTournamentActivity } from '../hooks/useTournamentActivity';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

// ---------------------------------------------------------------------------
// Small shared presentational helpers
// ---------------------------------------------------------------------------

function SectionTitle({ children, className = '' }) {
  return (
    <div className={`text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mt-6 mb-2 ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ResultChip({ won }) {
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold ${won ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
      {won ? 'W' : 'L'}
    </span>
  );
}

function RoleBanner({ title, subtitle, ctaLabel, ctaHref, alert }) {
  return (
    <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div className="text-xs uppercase tracking-[0.15em] font-bold text-muted-foreground">{title}</div>
        <div className="text-sm mt-0.5">{subtitle}</div>
      </div>
      {ctaLabel && (
        <Link to={ctaHref}>
          <Button size="sm" variant={alert ? 'default' : 'outline'}>{ctaLabel}</Button>
        </Link>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Role-specific banners shown at the top of the dashboard
// ---------------------------------------------------------------------------

function OrganizerBanner({ user }) {
  return (
    <RoleBanner
      title="Tournament Organizer"
      subtitle={
        <>
          {user.clubName || 'Create and manage AITA tournament events'}
          {user.isVerified && <span className="ml-2 text-primary font-bold">Verified</span>}
        </>
      }
      ctaLabel="My Events →"
      ctaHref="/tournaments"
    />
  );
}

function CoachBanner({ user, links }) {
  const activeCount = (links || []).filter(l => l.status === 'active').length;
  const pendingCount = (links || []).filter(l => l.status === 'pending' && l.coachId === user.id).length;
  return (
    <RoleBanner
      title="Coach"
      subtitle={
        <>
          {activeCount} player{activeCount !== 1 ? 's' : ''} linked
          {pendingCount > 0 && ` · ${pendingCount} pending`}
          {user.clubName && ` · ${user.clubName}`}
        </>
      }
      ctaLabel="My Players →"
      ctaHref="/my-players"
    />
  );
}

function PlayerBanner({ user, links }) {
  const coachCount = (links || []).filter(l => l.status === 'active').length;
  const pendingCount = (links || []).filter(l => l.status === 'pending' && l.playerId === user.id).length;
  return (
    <RoleBanner
      title="Player"
      subtitle={
        <>
          {user.aitaReg && `AITA ${user.aitaReg} · `}
          {user.ranking && `Rank ${user.ranking} · `}
          {user.stateAbbr || ''}
          {coachCount > 0 && ` · ${coachCount} coach${coachCount !== 1 ? 'es' : ''}`}
          {pendingCount > 0 && (
            <span className="text-primary font-semibold"> · {pendingCount} coach request{pendingCount !== 1 ? 's' : ''}</span>
          )}
        </>
      }
      ctaLabel={pendingCount > 0 ? 'View Requests →' : null}
      ctaHref="/my-coaches"
      alert={pendingCount > 0}
    />
  );
}

// ---------------------------------------------------------------------------
// On-court-today banner + recent-form sparkline
// ---------------------------------------------------------------------------

function PlayerLiveBanner({ todayMatches }) {
  if (!todayMatches || todayMatches.length === 0) return null;
  const next = todayMatches[0];
  return (
    <Card className="p-4 border-l-4 border-primary flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          On court today
        </div>
        <div className="font-display font-extrabold text-lg tracking-tighter mt-1">vs {opponentName(next)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {next.eventAgeGroup} {next.eventCategory} · R{next.round}
          {next.courtNumber != null && ` · Court ${next.courtNumber}`}
          {next.matchOrder != null && ` · #${next.matchOrder}`}
        </div>
      </div>
      <Link to="/track"><Button size="sm">Start tracking</Button></Link>
    </Card>
  );
}

function FormBars({ matches }) {
  const last10 = matches.slice(0, 10).reverse();
  if (last10.length === 0) return null;
  const wins = last10.filter(m => m.winner === 'self').length;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Form · Last {last10.length}</div>
        <div className="text-xs font-semibold text-muted-foreground">{wins}W · {last10.length - wins}L</div>
      </div>
      <div className="flex items-end gap-1 h-10 mt-3">
        {last10.map((m, i) => (
          <div
            key={m.id || i}
            className={`flex-1 rounded-sm ${m.winner === 'self' ? 'bg-primary h-full' : 'bg-muted h-2/5'}`}
            title={`${m.selfName} vs ${m.oppName} · ${m.winner === 'self' ? 'Won' : 'Lost'}`}
          />
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tournament activity helpers
// ---------------------------------------------------------------------------

function opponentName(match) {
  const opp = match.mineSide === 'entry1' ? match.entry2 : match.entry1;
  if (!opp) return 'TBD';
  if (opp.isBye) return 'BYE';
  return opp.familyName + (opp.firstName ? `, ${opp.firstName}` : '');
}

function TodayMatchRow({ match, showOwner, ownerName }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card">
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">
          {showOwner && ownerName ? `${ownerName} vs ` : 'vs '}{opponentName(match)}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {match.eventAgeGroup} {match.eventCategory} · R{match.round}
          {match.courtNumber != null && ` · Court ${match.courtNumber}`}
          {match.matchOrder != null && ` · #${match.matchOrder}`}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ match, showOwner, ownerName }) {
  const won = match.winnerEntryId && match.mineSide && match.winnerEntryId === match[match.mineSide + 'Id'];
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card">
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">
          {showOwner && ownerName ? `${ownerName} vs ` : 'vs '}{opponentName(match)}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {match.eventAgeGroup} {match.eventCategory} · R{match.round} · {match.week?.name}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ResultChip won={won} />
        <span className="text-sm font-bold">{match.score || match.outcomeType?.toUpperCase()}</span>
      </div>
    </div>
  );
}

function PlayerTournamentSections({ loading, error, tournaments, todayMatches, recentResults }) {
  if (loading) return <EmptyState>Loading tournament activity…</EmptyState>;
  if (error) return <EmptyState>{error}</EmptyState>;
  if (tournaments.length === 0) {
    return <EmptyState>Not entered in any tournaments yet.</EmptyState>;
  }

  return (
    <div>
      <SectionTitle>My Tournaments</SectionTitle>
      <div className="space-y-2">
        {tournaments.map(({ week, events }) => (
          <Card key={week.id} className="p-3">
            <Link to={`/tournaments/${week.id}`} className="text-sm font-bold hover:text-primary">{week.name}</Link>
            <div className="text-xs text-muted-foreground mt-0.5">
              {[week.location, week.city, week.startDate].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-2 space-y-1">
              {events.map(({ event, entry }) => (
                <Link
                  key={entry.id}
                  to={`/tournaments/${week.id}/events/${event.id}`}
                  className="flex items-center justify-between gap-2 text-xs py-1 hover:text-primary"
                >
                  <span>{event.ageGroup} {event.category}{entry.drawType === 'qualifying' ? ' (Qualifying)' : ''}</span>
                  <span className="text-muted-foreground">
                    {entry.seed ? `Seed ${entry.seed} · ` : ''}Pos {entry.position}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle>Today's Matches</SectionTitle>
      {todayMatches.length === 0 ? (
        <EmptyState>No matches scheduled for today.</EmptyState>
      ) : (
        <div className="space-y-2">
          {todayMatches.map(m => <TodayMatchRow key={m.id} match={m} />)}
        </div>
      )}

      <SectionTitle>Recent Results</SectionTitle>
      {recentResults.length === 0 ? (
        <EmptyState>No completed matches yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {recentResults.slice(0, 5).map(m => <ResultRow key={m.id} match={m} />)}
        </div>
      )}
    </div>
  );
}

function CoachTournamentSections({ loading, error, todayMatches, recentResults, activeLinks }) {
  if (loading) return <EmptyState>Loading tournament activity…</EmptyState>;
  if (error) return <EmptyState>{error}</EmptyState>;

  const nameFor = aitaReg => {
    const link = activeLinks.find(l => l.player?.aitaReg === aitaReg);
    return link?.player?.displayName || null;
  };

  const roster = activeLinks.map(l => {
    const mine = recentResults.filter(m => m.ownerAitaReg === l.player?.aitaReg);
    const wins = mine.filter(m => m.winnerEntryId && m.mineSide && m.winnerEntryId === m[m.mineSide + 'Id']).length;
    return { link: l, wins, losses: mine.length - wins };
  });

  return (
    <div>
      <SectionTitle>Today — All Players</SectionTitle>
      {todayMatches.length === 0 ? (
        <EmptyState>No matches scheduled for today across your roster.</EmptyState>
      ) : (
        <div className="space-y-2">
          {todayMatches.map(m => (
            <TodayMatchRow key={m.id} match={m} showOwner ownerName={nameFor(m.ownerAitaReg)} />
          ))}
        </div>
      )}

      <SectionTitle>Roster</SectionTitle>
      {roster.length === 0 ? (
        <EmptyState>No players linked yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {roster.map(({ link, wins, losses }) => (
            <div key={link.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card">
              <div>
                <div className="text-sm font-bold">{link.player?.displayName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {link.player?.aitaReg && `AITA ${link.player.aitaReg}`}
                  {link.player?.ranking && ` · Rank ${link.player.ranking}`}
                </div>
              </div>
              <div className="text-sm font-bold">{wins}W – {losses}L</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';

  const [matches, setMatches]   = useState(null);
  const [links, setLinks]       = useState(null);
  const [error, setError]       = useState('');
  const [myEntries, setMyEntries]         = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Load personal match history for players and coaches
  useEffect(() => {
    if (role === 'organizer') return;
    let cancelled = false;
    api.listMatches(user.id)
      .then(list => { if (!cancelled) setMatches(list); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load matches'); });
    return () => { cancelled = true; };
  }, [user.id, role]);

  // Load coach/player links for coach + player banners
  useEffect(() => {
    if (role === 'organizer') return;
    let cancelled = false;
    api.getCoachLinks(user.id)
      .then(data => { if (!cancelled) setLinks(data); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [user.id, role]);

  // Load player's self-entered events + pending invitations
  useEffect(() => {
    if (role !== 'player') return;
    let cancelled = false;
    api.getMyEntries().then(data => { if (!cancelled) setMyEntries(data); }).catch(() => {});
    api.getMyPendingInvitations().then(data => { if (!cancelled) setPendingInvites(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [role]);

  const matchesOnly = matches ? matches.filter(m => m.sessionType !== 'practice') : [];
  const practices   = matches ? matches.filter(m => m.sessionType === 'practice') : [];
  const wins        = matchesOnly.filter(m => m.winner === 'self').length;
  const losses      = matchesOnly.filter(m => m.winner === 'opp').length;
  const winRate     = matchesOnly.length > 0 ? Math.round((wins / matchesOnly.length) * 100) : null;
  const recent      = matches ? matches.slice(0, 5) : [];

  // Tournament activity (player: self, coach: whole active roster)
  const activeLinks = (links || []).filter(l => l.status === 'active');
  const rosterAitaRegs = role === 'coach'
    ? activeLinks.map(l => l.player?.aitaReg).filter(Boolean)
    : role === 'player' && user.aitaReg ? [user.aitaReg] : [];
  const activity = useTournamentActivity(rosterAitaRegs);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-4">
      {/* Role banner */}
      {role === 'organizer' && <OrganizerBanner user={user} />}
      {role === 'coach'     && <CoachBanner user={user} links={links} />}
      {role === 'player'    && <PlayerBanner user={user} links={links} />}

      {/* Welcome */}
      <div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">
          Welcome back, {(user.displayName || user.name || '').split(' ')[0]}
        </h1>
        <div className="text-sm text-muted-foreground mt-0.5">
          {role === 'organizer' ? 'Tournament management overview'
            : role === 'coach' ? 'Your coaching overview'
            : 'Your performance overview'}
        </div>
      </div>

      {/* Player: on-court-today banner + recent form */}
      {role === 'player' && <PlayerLiveBanner todayMatches={activity.todayMatches} />}
      {role === 'player' && matchesOnly.length > 0 && <FormBars matches={matchesOnly} />}

      {/* Organizer: quick actions only */}
      {role === 'organizer' && (
        <div>
          <Link to="/tournaments"><Button>View My Tournaments</Button></Link>
          <div className="mt-4">
            <EmptyState>
              Use the <strong>Tournaments</strong> section to create events, manage draws, and enter scores.
            </EmptyState>
          </div>
        </div>
      )}

      {/* Player: pending doubles invitations */}
      {role === 'player' && pendingInvites.length > 0 && (
        <div>
          <SectionTitle className="text-amber-500">Doubles Invitations ({pendingInvites.length})</SectionTitle>
          <div className="space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card flex-wrap">
                <div>
                  <div className="text-sm font-bold">
                    Doubles invitation — {inv.event?.tournament_week?.name || 'tournament'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {inv.event?.category} {inv.event?.age_group} · From AITA {inv.inviter_aita_reg}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await api.respondToInvitation(inv.id, true);
                        setPendingInvites(prev => prev.filter(i => i.id !== inv.id));
                      } catch (e) { alert(e.message); }
                    }}
                  >Accept</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api.respondToInvitation(inv.id, false);
                        setPendingInvites(prev => prev.filter(i => i.id !== inv.id));
                      } catch (e) { alert(e.message); }
                    }}
                  >Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player: My Entries */}
      {role === 'player' && myEntries !== null && myEntries.length > 0 && (
        <div>
          <SectionTitle>My Entries</SectionTitle>
          <div className="space-y-2">
            {myEntries.filter(e => e.entryStatus !== 'withdrawn').map(entry => (
              <div key={entry.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card">
                <div>
                  <Link
                    to={`/tournaments/${entry.event?.week?.id}/events/${entry.eventId}`}
                    className="text-sm font-bold hover:text-primary"
                  >
                    {entry.event?.category} {entry.event?.ageGroup}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.event?.week?.name}{entry.event?.week?.startDate ? ` · ${entry.event.week.startDate}` : ''}
                    {' · '}
                    {entry.isAlternate ? 'Alternate' : entry.drawType === 'main' ? `Main Draw #${entry.position}` : `Qualifying #${entry.position}`}
                  </div>
                </div>
                <span className={`text-xs font-bold rounded-sm px-1.5 py-0.5 ${entry.entryStatus === 'placed' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {entry.entryStatus === 'placed' ? 'Entered' : entry.entryStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player: tournament activity */}
      {role === 'player' && (
        <PlayerTournamentSections
          loading={activity.loading}
          error={activity.error}
          tournaments={activity.tournaments}
          todayMatches={activity.todayMatches}
          recentResults={activity.recentResults}
        />
      )}

      {/* Coach: roster tournament activity */}
      {role === 'coach' && (
        <CoachTournamentSections
          loading={activity.loading}
          error={activity.error}
          todayMatches={activity.todayMatches}
          recentResults={activity.recentResults}
          activeLinks={activeLinks}
        />
      )}

      {/* Player: ranking performance lives on the multi-segment dashboard */}
      {role === 'player' && (
        <div>
          <SectionTitle>Performance</SectionTitle>
          <Link to="/player-dashboard?tab=performance"><Button variant="outline">View My Performance →</Button></Link>
        </div>
      )}

      {/* Player + Coach: personal tracker */}
      {role !== 'organizer' && (
        <div>
          <SectionTitle>My Stats</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Link to="/track"><Button>+ Track New Match</Button></Link>
            <Link to="/video-analysis-test"><Button variant="outline">Video Analysis (Beta)</Button></Link>
          </div>

          {error && <div className="mt-4"><EmptyState>{error}</EmptyState></div>}
          {matches === null && !error && <div className="mt-4"><EmptyState>Loading…</EmptyState></div>}

          {matches !== null && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
                <Card className="p-4">
                  <div className="text-2xl font-display font-extrabold tracking-tighter">{matchesOnly.length}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1">Matches</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-display font-extrabold tracking-tighter text-primary">{wins}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1">Wins</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-display font-extrabold tracking-tighter text-destructive">{losses}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1">Losses</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-display font-extrabold tracking-tighter text-accent-foreground">
                    {winRate !== null ? winRate + '%' : '—'}
                  </div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1">Win Rate</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-display font-extrabold tracking-tighter">{practices.length}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1">Practices</div>
                </Card>
              </div>

              {recent.length > 0 && (
                <div>
                  <SectionTitle>Recent Activity</SectionTitle>
                  <div className="space-y-2">
                    {recent.map(m => (
                      <Link
                        to={'/history/' + m.id}
                        key={m.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card hover:border-primary"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{m.selfName} vs {m.oppName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {(m.tournament ? m.tournament + ' · ' : '')}{m.date || ''}
                            {m.sessionType === 'practice' ? ' · Practice' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {m.winner === 'self' && <ResultChip won />}
                          {m.winner === 'opp'  && <ResultChip won={false} />}
                          <span className="text-sm font-bold">{m.scoreSummary}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {matches.length > 5 && (
                    <Link to="/history" className="inline-block mt-2 text-sm font-semibold text-primary hover:underline">
                      View all matches →
                    </Link>
                  )}
                </div>
              )}

              {matches.length === 0 && (
                <div className="mt-4">
                  <EmptyState>No matches yet — track your first match to see stats here.</EmptyState>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
