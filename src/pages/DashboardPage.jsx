import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { useTournamentActivity } from '../hooks/useTournamentActivity';
import { computeStreak } from '../lib/streaks';
import { autoProtectStreak, getTokenState } from '../lib/streakTokens';
import { avgSkillRatings, listDrills } from '../lib/localStore';
import { computeNutritionAchievements } from '../lib/nutritionCompliance';
import { getNutritionLogs } from '../api/nutritionMock';
import {
  computeMomentum, computeWeeklyRings, computeAchievements,
  computeNextMilestone, getDailyMission, getMissionStreak,
} from '../lib/motivation';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { StatCardSkeleton, ListItemSkeleton, Skeleton } from '@/components/primitives/skeleton';
import { LogTodayReminder, QuickAddGrid, Recent5Strip, DigestPreviewCard } from '@/components/DashboardExtras';
import SkillRadarCard from '@/components/SkillRadarCard';
import PlayerRatingCard from '@/components/PlayerRatingCard';
import PerformanceSummarySection from '@/components/PerformanceSummarySection';
import MomentumMeter from '@/components/motivation/MomentumMeter';
import WeeklyGoalRings from '@/components/motivation/WeeklyGoalRings';
import DailyMissionCard from '@/components/motivation/DailyMissionCard';
import AchievementsReel from '@/components/motivation/AchievementsReel';
import NextMilestoneCard from '@/components/motivation/NextMilestoneCard';
import H2HRivalryCard from '@/components/H2HRivalryCard';
import { SegmentProvider, useSegment, useOptionalSegment } from '../context/SegmentContext';
import { Trophy, TrendingUp, TrendingDown, Calendar, Target, Flame } from 'lucide-react';

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
    <span className={`rounded-sm px-1.5 py-0.5 text-xs font-bold ${won ? 'bg-primary/10 text-accent-ink' : 'bg-destructive/10 text-destructive'}`}>
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
          {user.isVerified && <span className="ml-2 text-accent-ink font-bold">Verified</span>}
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
            <span className="text-accent-ink font-semibold"> · {pendingCount} coach request{pendingCount !== 1 ? 's' : ''}</span>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-ink">
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

function StreakCard({ streak, tokenState, protection }) {
  const tokens = tokenState?.tokens ?? 0;
  const max = tokenState?.max ?? 3;
  // Prefer the persisted autoConsumed list (survives across renders/reloads)
  // over the transient newSpends from this specific render.
  const recentAutoFreezes = (() => {
    const list = tokenState?.autoConsumed || [];
    const cutoff = Date.now() - 8 * 86400000; // last 8 days
    return list.filter(d => new Date(d + 'T00:00:00').getTime() >= cutoff);
  })();
  const protectedCount = recentAutoFreezes.length || (protection?.newSpends?.length ?? 0);

  return (
    <Card className="p-5 sm:p-6 bg-card border-l-4 border-l-primary shadow-sm" data-testid="streak-card">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Flame className="w-7 h-7 sm:w-8 sm:h-8 text-accent-ink" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-display font-extrabold text-3xl sm:text-4xl tracking-tighter text-accent-ink">{streak.current}</div>
            <div className="text-sm sm:text-base uppercase tracking-wider font-bold text-muted-foreground">day streak</div>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Best {streak.best} {streak.best === 1 ? 'day' : 'days'}
            {!streak.loggedToday && streak.graceAvailable && ' · Log today to keep it going'}
            {!streak.loggedToday && !streak.graceAvailable && streak.current > 0 && ' · Grace day used — log today or lose your streak'}
            {streak.loggedToday && ' · ✓ Logged today'}
          </div>
        </div>
      </div>

      {/* Streak Freeze Tokens */}
      {tokenState && (
        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5" data-testid="freeze-token-indicator">
              {Array.from({ length: max }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-6 rounded-sm ${i < tokens ? 'bg-blue-500' : 'bg-muted border border-border'}`}
                  title={i < tokens ? 'Freeze token' : 'Slot empty'}
                />
              ))}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold">
                {tokens} freeze token{tokens === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {tokens < max
                  ? `Next in ${tokenState.nextInDays} day${tokenState.nextInDays === 1 ? '' : 's'}`
                  : 'Vault is full · spend or wait'}
              </div>
            </div>
          </div>
          {protectedCount > 0 && (
            <div className="text-[11px] font-bold text-blue-500 text-right leading-tight" data-testid="freeze-spent-note">
              🛡️ Auto-protected<br />
              {protectedCount} rest day{protectedCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function FormBars({ matches }) {
  const last10 = matches.slice(0, 10).reverse();
  if (last10.length === 0) return null;
  const wins = last10.filter(m => m.winner === 'self').length;
  const winRate = Math.round((wins / last10.length) * 100);
  
  return (
    <Card className="p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Recent Form</div>
          <div className="text-sm text-muted-foreground mt-0.5">Last {last10.length} matches</div>
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-2xl tracking-tighter">{winRate}%</div>
          <div className="text-xs font-semibold text-muted-foreground">{wins}W - {last10.length - wins}L</div>
        </div>
      </div>
      <div className="flex items-end gap-1.5 sm:gap-2 h-14 sm:h-16">
        {last10.map((m, i) => {
          const isWin = m.winner === 'self';
          return (
            <div
              key={m.id || i}
              className={`flex-1 rounded-t-md transition-all ${
                isWin 
                  ? 'bg-primary h-full hover:opacity-80' 
                  : 'bg-muted h-[40%] hover:opacity-80'
              }`}
              title={`${m.selfName} vs ${m.oppName} · ${isWin ? 'Won' : 'Lost'}`}
            />
          );
        })}
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
            <Link to={`/tournaments/${week.id}`} className="text-sm font-bold hover:text-accent-ink">{week.name}</Link>
            <div className="text-xs text-muted-foreground mt-0.5">
              {[week.location, week.city, week.startDate].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-2 space-y-1">
              {events.map(({ event, entry }) => (
                <Link
                  key={entry.id}
                  to={`/tournaments/${week.id}/events/${event.id}`}
                  className="flex items-center justify-between gap-2 text-xs py-1 hover:text-accent-ink"
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

// Bundles the four motivation widgets (Momentum, Weekly Rings, Daily Mission,
// Achievements) into a single reactive cluster. Kept co-located so all
// derived motivation state comes from one recompute pass.
function PlayerMotivationCluster({ user, matches, streak, upcomingMatches }) {
  const [nutritionLogs, setNutritionLogs] = useState([]);
  const [missionTick, setMissionTick] = useState(0); // force refresh after complete
  // Pull rank history if we're inside a SegmentProvider — that's the case
  // for players with an aitaReg. Falls back to null (rank-climber badge just
  // stays locked) for players without one.
  const seg = useOptionalSegment();
  const rankHistory = seg?.rankingHistory || null;

  useEffect(() => {
    let cancelled = false;
    getNutritionLogs(user.id)
      .then(logs => { if (!cancelled) setNutritionLogs(logs || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user.id]);

  const ratings = avgSkillRatings(user.id, 5);
  const drillCount = listDrills(user.id).length;
  const momentum = computeMomentum({ matches, streak, ratings });
  const rings = computeWeeklyRings({ matches, nutritionLogs });
  const achievements = computeAchievements({ matches, streak, drillCount, ratings, rankHistory });
  // Merge in nutrition-side achievements so both live in the same trophy cabinet.
  const [nutritionLogsAll, setNutritionLogsAll] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getNutritionLogs(user.id)
      .then(l => { if (!cancelled) setNutritionLogsAll(l || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user.id]);
  const nutritionAch = computeNutritionAchievements(nutritionLogsAll, user.id);
  const mergedAchievements = {
    unlocked: [...achievements.unlocked, ...nutritionAch.unlocked],
    locked:   [...achievements.locked,   ...nutritionAch.locked],
    unlockedCount: achievements.unlockedCount + nutritionAch.unlockedCount,
    totalCount:    achievements.totalCount    + nutritionAch.totalCount,
  };
  const mission = getDailyMission(user.id);
  const missionStreak = getMissionStreak(user.id);

  return (
    <>
      <MomentumMeter momentum={momentum} />

      <H2HRivalryCard upcomingMatches={upcomingMatches || []} history={matches} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeeklyGoalRings rings={rings} />
        <DailyMissionCard
          mission={mission}
          missionStreak={missionStreak}
          userId={user.id}
          onComplete={() => setMissionTick(t => t + 1)}
          key={missionTick}
        />
      </div>

      <AchievementsReel achievements={mergedAchievements} playerName={user.displayName || user.name} />
    </>
  );
}

// Renders the Next Milestone card inside the SegmentProvider so it can pull
// the player's active circuit + best rank. Selects the player's STRONGEST
// circuit (lowest best-ever rank) as the primary so the milestone is
// concretely close, not "383 ranks to top-10".
function NextMilestoneAutowire({ user, matches, streak }) {
  const { circuits } = useSegment();
  const orderedCircuits = [...(circuits || [])].sort((a, b) => a.bestRank - b.bestRank);
  const milestone = computeNextMilestone({ circuits: orderedCircuits, matches, streak });
  if (!milestone) return null;
  return <NextMilestoneCard milestone={milestone} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'player';

  const [matches, setMatches]   = useState(null);
  const [links, setLinks]       = useState(null);
  const [error, setError]       = useState('');
  const [myEntries, setMyEntries]         = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [streakInputs, setStreakInputs] = useState(null); // { sessionDates, freezeDates }

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

  // Streak (Phase 34) — training-session dates + freeze dates; matches are
  // already loaded above and reused for the match-date half of the streak.
  useEffect(() => {
    if (role === 'organizer') return;
    let cancelled = false;
    Promise.all([api.getTrainingSessions(user.id), api.getStreakFreezes(user.id)])
      .then(([sessions, freezes]) => {
        if (cancelled) return;
        setStreakInputs({
          sessionDates: (sessions || []).map(s => s.sessionDate),
          freezeDates: (freezes || []).map(f => f.freezeDate),
        });
      })
      .catch(() => { if (!cancelled) setStreakInputs({ sessionDates: [], freezeDates: [] }); });
    return () => { cancelled = true; };
  }, [user.id, role]);

  const matchesOnly = matches ? matches.filter(m => m.sessionType !== 'practice') : [];
  const practices   = matches ? matches.filter(m => m.sessionType === 'practice') : [];
  const wins        = matchesOnly.filter(m => m.winner === 'self').length;
  const losses      = matchesOnly.filter(m => m.winner === 'opp').length;
  const winRate     = matchesOnly.length > 0 ? Math.round((wins / matchesOnly.length) * 100) : null;
  const recent      = matches ? matches.slice(0, 5) : [];

  // Auto-consume streak-freeze tokens for missed days in the last 2 weeks
  // so a single skipped day doesn't break a long run. Memoised so we don't
  // re-touch localStorage on every render / StrictMode double-invoke.
  const logDates = useMemo(() => (
    matches && streakInputs
      ? [...matches.map(m => m.date), ...streakInputs.sessionDates]
      : null
  ), [matches, streakInputs]);

  const protection = useMemo(() => (
    role !== 'organizer' && logDates
      ? autoProtectStreak(user.id, logDates, streakInputs.freezeDates || [])
      : null
  ), [role, logDates, streakInputs, user.id]);

  const tokenState = useMemo(() => (
    role !== 'organizer' && logDates ? getTokenState(user.id) : null
  ), [role, logDates, user.id, protection]);

  const streak = useMemo(() => (
    logDates
      ? computeStreak(logDates, { freezeDates: protection ? protection.freezeDates : streakInputs.freezeDates })
      : null
  ), [logDates, protection, streakInputs]);

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

      {/* Log-today reminder (all roles, after 6PM if no session today) */}
      {matches && (
        <LogTodayReminder
          loggedToday={matches.some(m => m.date === new Date().toISOString().slice(0, 10))}
        />
      )}

      {/* Quick-Add tiles (player/coach) */}
      {(role === 'player' || role === 'coach') && <QuickAddGrid />}

      {role !== 'organizer' && streak && <StreakCard streak={streak} tokenState={tokenState} protection={protection} />}
      {role === 'player' && matchesOnly.length > 0 && <FormBars matches={matchesOnly} />}

      {/* ═════════ Player motivation cluster + performance snapshot ═════════ */}
      {role === 'player' && matches && (
        user.aitaReg ? (
          <SegmentProvider>
            <PlayerMotivationCluster
              user={user}
              matches={matches}
              streak={streak?.current || 0}
              upcomingMatches={activity.todayMatches}
            />
            <PerformanceSummarySection />
            <NextMilestoneAutowire user={user} matches={matches || []} streak={streak?.current || 0} />
          </SegmentProvider>
        ) : (
          <PlayerMotivationCluster
            user={user}
            matches={matches}
            streak={streak?.current || 0}
            upcomingMatches={activity.todayMatches}
          />
        )
      )}

      {/* Skill Radar + Tracker Rating + Digest Preview (player only) */}
      {role === 'player' && matches && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkillRadarCard
            ratings={avgSkillRatings(user.id, 5)}
            stats={winRate !== null ? { winRate, matches: matchesOnly.length } : null}
            onCta={matchesOnly.length > 0 ? () => window.location.assign(`/history/${matchesOnly[0].id}`) : null}
            ctaLabel={matchesOnly.length > 0 ? 'Rate your latest match' : 'Play a match first'}
          />
          <PlayerRatingCard playerId={user.id} aitaReg={user.aitaReg} />
          <DigestPreviewCard matches={matches} streak={streak} />
        </div>
      )}

      {/* Recent 5 sessions (player only) */}
      {role === 'player' && matches && matches.length > 0 && (
        <Recent5Strip matches={matches} onSelect={(m) => window.location.assign(`/history/${m.id}`)} />
      )}

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
                    className="text-sm font-bold hover:text-accent-ink"
                  >
                    {entry.event?.category} {entry.event?.ageGroup}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.event?.week?.name}{entry.event?.week?.startDate ? ` · ${entry.event.week.startDate}` : ''}
                    {' · '}
                    {entry.isAlternate ? 'Alternate' : entry.drawType === 'main' ? `Main Draw #${entry.position}` : `Qualifying #${entry.position}`}
                  </div>
                </div>
                <span className={`text-xs font-bold rounded-sm px-1.5 py-0.5 ${entry.entryStatus === 'placed' ? 'bg-primary/10 text-accent-ink' : 'bg-muted text-muted-foreground'}`}>
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

      {/* Player + Coach: personal tracker */}
      {role !== 'organizer' && (
        <div>
          <SectionTitle>My Stats</SectionTitle>

          {error && <EmptyState>{error}</EmptyState>}
          {matches === null && !error && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)}
            </div>
          )}

          {matches !== null && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Trophy className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">{matchesOnly.length}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Matches</div>
                </Card>
                <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-primary/10 border-l-4 border-l-primary">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="w-5 h-5 text-accent-ink" />
                  </div>
                  <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter text-accent-ink">{wins}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Wins</div>
                </Card>
                <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-destructive/10 border-l-4 border-l-destructive">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingDown className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter text-destructive">{losses}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Losses</div>
                </Card>
                <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Target className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter text-accent-foreground">
                    {winRate !== null ? winRate + '%' : '—'}
                  </div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Win Rate</div>
                </Card>
                <Card className="p-4 sm:p-5 hover:shadow-md transition-shadow bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">{practices.length}</div>
                  <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mt-1.5">Practices</div>
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
                    <Link to="/history" className="inline-block mt-2 text-sm font-semibold text-accent-ink hover:underline">
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
