import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMatchTracker } from '../hooks/useMatchTracker';
import { useMatchTiming } from '../hooks/useMatchTiming';
import { useWakeLock } from '../hooks/useWakeLock';
import { useAuth } from '../context/AuthContext';
import { getWeatherString } from '../lib/weather';
import { parseTrackForState } from '../lib/proxyTracking';
import { useLiveTrackingSync, endLiveTrackingSessionQuiet } from '../hooks/useLiveTrackingSync';
import LiveTrackingShareBanner from '../components/tracker/LiveTrackingShareBanner';
import * as api from '../api';
import AppNav from '../components/AppNav';
import Scorebar from '../components/Scorebar';
import Wizard from '../components/Wizard';
import QuickMode from '../components/tracker/QuickMode';
import StatsPanel from '../components/StatsPanel';
import PointLog from '../components/PointLog';
import ActionButtons from '../components/ActionButtons';
import MomentumGraph from '../components/MomentumGraph';
import ShotLocationHeatmap from '../components/ShotLocationHeatmap';
import AiReviewModal from '../components/AiReviewModal';
import LiveMatchAdvisor from '../components/LiveMatchAdvisor';
import LiveMatchCommandCenter from '../components/tracker/LiveMatchCommandCenter';
import MatchTimingBanners from '../components/tracker/MatchTimingBanners';
import HighlightReelCard from '../components/tracker/HighlightReelCard';
import { computeStats, computeServeStats } from '../lib/analytics';
import { cn } from '../lib/utils';
import '../styles/tracker-tailwind.css';
import { Tabs, TabsList, TabsTrigger } from '../components/primitives/tabs';
import { Card, CardContent } from '../components/primitives/card';
import { Button } from '../components/primitives/button';
import { Input } from '../components/primitives/input';
import { Select } from '../components/primitives/select';
import { Table, TableBody, TableRow, TableHead, TableCell } from '../components/primitives/table';

const SURFACES = [
  'Acrylic (Hard-Court)', 'Artificial Clay', 'Artificial Grass',
  'Asphalt (Hard-Court)', 'Carpet', 'Clay', 'Concrete (Hard-Court)', 'Grass', 'Other Surface',
];

// Governing body → circuits, used to tag which organisation/circuit a match belongs to.
const GOVERNING_BODIES = {
  AITA: [
    'Talent Series', 'Championship Series (CS3)', 'Championship Series (CS7)',
    'Super Series', 'National Series', 'National Championships',
    'Davis Cup (Men)', 'Billie Jean King Cup (Women)',
  ],
  ITF: [
    'ITF World Tennis Tour', 'ITF Junior Circuit', 'ITF Seniors Circuit',
    'ITF Wheelchair Tennis Tour', 'ITF Beach Tennis Tour',
    'Davis Cup', 'Billie Jean King Cup', 'Olympic & Paralympic Tennis',
  ],
  WTA: ['WTA 1000', 'WTA 500', 'WTA 250', 'WTA Finals', 'WTA Elite Trophy'],
  ATF: [
    'Asian Junior Circuit (U-14)', 'Asian Junior Circuit (U-16)', 'Asian Junior Circuit (U-18)',
    'Asian Ranking Tournaments', 'Development Programs', 'Regional Championships',
  ],
  ATP: [
    'ATP Masters 1000', 'ATP 500', 'ATP 250', 'ATP Challenger Tour',
    "ITF Men's World Tennis Tour", 'ATP Finals', 'Next Gen ATP Finals',
  ],
};
const GOVERNING_BODY_NAMES = Object.keys(GOVERNING_BODIES);

const AGE_GROUPS = ['Under 10', 'Under 12', 'Under 14', 'Under 16', 'Under 18', 'Men', 'Women', 'Senior'];

const PLAYING_STYLES = ['Baseliner', 'Aggressive Baseliner', 'Serve & Volley', 'All-Court'];

const ROUNDS = [
  'Qualifying Round 1', 'Qualifying Round 2', 'Qualifying Final',
  'Round of 64', 'Round of 32', 'Round of 16',
  'Quarterfinal', 'Semifinal', 'Final',
];

// Short round tokens ('R32', 'QF', 'SF', 'F') — used by tournament data and
// TodaysMatchHero prefill — mapped to the exact <option> labels above so the
// prefill actually selects the right round instead of silently blanking it.
const ROUND_TOKEN_TO_LABEL = {
  Q1: 'Qualifying Round 1',
  Q2: 'Qualifying Round 2',
  QF_Q: 'Qualifying Final',
  R64: 'Round of 64',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  F: 'Final',
};
function normalizeRoundPrefill(round) {
  if (!round) return round;
  if (ROUNDS.includes(round)) return round;
  return ROUND_TOKEN_TO_LABEL[round] || round;
}

// AITA calendar "grade" text → our Circuit dropdown labels. The synced `grade`
// column is inconsistent by nature of where it came from: once a tournament's
// factsheet PDF has been parsed it's the full descriptive category, e.g.
// "National Series"; before that, it's a short code lifted from the calendar
// listing name, e.g. "AITA NS Under 14". Checked in this order so the more
// specific descriptive phrases win before falling back to code-word matches.
function mapAitaGradeToCircuit(rawGrade) {
  if (!rawGrade) return null;
  const g = rawGrade.toLowerCase();
  if (g.includes('national championship')) return 'National Championships';
  if (g.includes('national series')) return 'National Series';
  if (g.includes('super series')) return 'Super Series';
  if (g.includes('talent series')) return 'Talent Series';
  if (g.includes('championship series') || /\bcs\s*-?\s*[37]\b/.test(g)) {
    if (/\bcs\s*-?\s*3\b/.test(g) || g.includes('3 star')) return 'Championship Series (CS3)';
    if (/\bcs\s*-?\s*7\b/.test(g) || g.includes('7 star')) return 'Championship Series (CS7)';
  }
  if (/\bnat\b/i.test(rawGrade)) return 'National Championships';
  if (/\bns\b/i.test(rawGrade)) return 'National Series';
  if (/\bss\b/i.test(rawGrade)) return 'Super Series';
  if (/\bts\b/i.test(rawGrade)) return 'Talent Series';
  return null;
}

const TRACKING_MODES = [
  { value: 'basic', label: 'Basic', hint: 'Rally length, forehand/backhand, and simplified net/out location — no shot-type ID or forced/unforced judgment needed.' },
  { value: 'advanced', label: 'Advanced', hint: 'Adds shot type, forced/unforced judgment, and finer (long/wide/net) error location.' },
];

// Temporarily disabled — Anthropic API billing not yet set up. Flip to true to re-enable.
const AI_REVIEW_ENABLED = false;
const hasSupabaseConfig = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export default function TrackerPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trackFor, setTrackFor] = useState(null);
  const [trackForError, setTrackForError] = useState('');

  useEffect(() => {
    const fromState = parseTrackForState(location.state);
    const fromQuery = searchParams.get('for');
    const playerId = fromState?.playerId || fromQuery;
    if (!playerId) {
      setTrackFor(null);
      setTrackForError('');
      return;
    }
    let cancelled = false;
    api.canTrackForPlayer(playerId)
      .then(ok => {
        if (cancelled) return;
        if (!ok) {
          setTrackFor(null);
          setTrackForError('You are not linked to this player — tracking saves to your own account only.');
          return;
        }
        setTrackForError('');
        setTrackFor({
          playerId,
          playerName: fromState?.playerName || 'Player',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTrackFor(null);
          setTrackForError('Could not verify tracking permission for this player.');
        }
      });
    return () => { cancelled = true; };
  }, [location.state, searchParams]);

  const t = useMatchTracker({
    subjectPlayerId: trackFor?.playerId || null,
    subjectPlayerName: trackFor?.playerName || '',
  });
  const timing = useMatchTiming({
    pointsLength: t.points.length,
    lastCommittedAt: t.points[t.points.length - 1]?.committedAt ?? null,
    gamesSelf: t.engine?.setGames?.self ?? 0,
    gamesOpp: t.engine?.setGames?.opp ?? 0,
    setsSelf: t.engine?.setsWon?.self ?? 0,
    setsOpp: t.engine?.setsWon?.opp ?? 0,
  });

  const handleCommitPoint = useCallback((entry) => {
    t.commitPoint({
      ...entry,
      ...timing.consumePendingTiming(),
      committedAt: Date.now(),
    });
  }, [t, timing]);
  const [liveSessionId, setLiveSessionId] = useState(null);

  useLiveTrackingSync({
    enabled: hasSupabaseConfig,
    sessionId: liveSessionId,
    setSessionId: setLiveSessionId,
    state: {
      header: t.header,
      sessionType: t.sessionType,
      formatPreset: t.formatPreset,
      formatCustom: t.formatCustom,
      pointTarget: t.pointTarget,
      trackingMode: t.trackingMode,
      serverChoice: t.serverChoice,
      points: t.points,
      matchStarted: t.matchStarted,
      matchStartTime: t.matchStartTime,
      matchEndTime: t.matchEndTime,
      matchSaved: t.matchSaved,
    },
    playerId: trackFor?.playerId || user?.id,
    trackedById: user?.id,
  });

  function handleResetMatch() {
    const endingId = liveSessionId;
    setLiveSessionId(null);
    endLiveTrackingSessionQuiet(endingId).finally(() => t.resetMatch());
  }

  const [activeTab, setActiveTab] = useState('match');
  const [aiReview, setAiReview] = useState(null); // { scope: 'game'|'set'|'match' } | null
  const [distractionFree, setDistractionFree] = useState(false);
  const [advisorHistory, setAdvisorHistory] = useState([]); // tips shown during this match, for the post-match Highlight Reel

  function handleStopMatch() {
    setActiveTab('close');
    t.showStatus('Tap "Save partial match to history" below to keep stats for later', 6000);
  }

  const hasUnsavedSession = t.matchStarted && t.points.length > 0;

  useEffect(() => {
    if (!hasUnsavedSession) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedSession]);

  // Reset advisor history whenever a fresh match starts / resets
  useEffect(() => {
    if (!t.matchStarted) setAdvisorHistory([]);
  }, [t.matchStarted]);

  const handleAdvisorTip = (tip) => setAdvisorHistory((prev) => [...prev, tip]);

  // Keep the screen awake for the entire live match — held once here so the
  // lock survives every game/set transition unmount inside the command center.
  useWakeLock(!!t.matchStarted && !t.engine?.matchOver);

  // When match ends / resets, always return to Match tab
  useEffect(() => {
    if (!t.matchStarted) setActiveTab('match');
  }, [t.matchStarted]);

  // Multi-segment dashboard, Phase 4 — "Track this match" (LogMatchButton)
  // navigates here with prefill in location.state. Applied once, then the
  // state is cleared via replace so refreshing /track doesn't re-prefill.
  useEffect(() => {
    const prefill = location.state?.trackerPrefill;
    if (prefill) {
      const normalized = { ...prefill, round: normalizeRoundPrefill(prefill.round) };
      t.updateHeader(normalized);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStartMatch() {
    t.startMatch();
    setActiveTab('track');
  }

  return (
    <AppNav>
    <div className="tracker-shell flex h-full flex-col overflow-hidden bg-background text-foreground font-body">
      {trackFor && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <div className="rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            Tracking for <strong>{trackFor.playerName}</strong> — points save to their match history.
          </div>
        </div>
      )}
      {trackForError && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <div className="rounded-sm border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
            {trackForError}
          </div>
        </div>
      )}
      {t.matchStarted && <LiveTrackingShareBanner sessionId={liveSessionId} />}
      {hasUnsavedSession && !t.engine?.matchOver && activeTab !== 'close' && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-2">
          <button
            type="button"
            onClick={handleStopMatch}
            className="w-full rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-amber-500/15 transition-colors"
          >
            Match stopped early (rain, injury, etc.)?{' '}
            <span className="font-semibold text-foreground">Close tab → Save partial match</span>{' '}
            to view stats later.
          </button>
        </div>
      )}
      {/* Scorebar only while a match is running */}
      {t.matchStarted && (
        <Scorebar
          header={t.header} sessionType={t.sessionType} formatPreset={t.formatPreset} pointTarget={t.pointTarget}
          engine={t.engine} nextServer={t.nextServer}
          matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
        />
      )}

      {/* Tab bar — always visible */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mx-auto w-full max-w-3xl px-4">
          <TabsTrigger value="match">Match</TabsTrigger>
          <TabsTrigger value="track" disabled={!t.matchStarted}>● Live Track</TabsTrigger>
          <TabsTrigger value="stats" disabled={!t.matchStarted}>Stats</TabsTrigger>
          <TabsTrigger
            value="close"
            disabled={!t.matchStarted}
            className={cn(t.matchStarted && activeTab !== 'close' && 'text-destructive')}
          >
            Close
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Global status message */}
      <div className="mx-auto mt-1 w-full max-w-3xl px-4">
        <div className="py-1 text-xs text-muted-foreground">{t.status}</div>
      </div>

      {/* On-demand AI review — available any time there are points to review */}
      {AI_REVIEW_ENABLED && t.matchStarted && t.points.length > 0 && (
        <div className="mx-auto mt-1 w-full max-w-3xl px-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setAiReview({ scope: 'match' })}>
            🤖 Review with AI
          </Button>
        </div>
      )}

      {/* ── Match tab ── */}
      {activeTab === 'match' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {t.matchStarted ? (
            /* Match running — show editable details + prompt to Track */
            <MatchRunningView t={t} onGoTrack={() => setActiveTab('track')} />
          ) : (
            /* No match — show new match form */
            <SetupForm t={t} onStart={handleStartMatch} />
          )}
        </div>
      )}

      {/*
        Live Track and Stats become one side-by-side view at >=1024px (README
        step 7: "drop the Match/Live/Stats tab switch and use two panes ...
        Keep the tabs below that width") — both blocks mount whenever either
        tab is selected, each one deciding for itself (activeTab check first,
        `lg:` second) whether it's visible. Match/Close stay exactly as they
        were; only the Track<->Stats split changes at that width.
      */}
      {(activeTab === 'track' || activeTab === 'stats') && t.matchStarted && (
        <div className="flex flex-1 min-h-0 flex-col lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-4 lg:pb-6">

        {/* ── Track pane ── */}
        <div className={cn(
          'flex-1 flex-col overflow-y-auto px-4 pb-6 lg:min-h-0 lg:px-0 lg:pb-0',
          activeTab === 'track' ? 'flex' : 'hidden lg:flex'
        )}>
          {t.gameTransition ? (
            <GameTransitionCard
              transition={t.gameTransition}
              selfName={t.header.selfName || 'You'}
              oppName={t.header.oppName || 'Opponent'}
              onContinue={t.clearTransition}
              onUndo={() => { t.undoLast(); }}
              canUndo={t.points.length > 0}
              onReview={AI_REVIEW_ENABLED ? () => setAiReview({ scope: t.gameTransition.type }) : null}
              pointRestSecsLeft={timing.pointRestSecsLeft}
              changeoverActive={timing.changeoverActive}
              changeoverSecsLeft={timing.changeoverSecsLeft}
              onDismissChangeover={timing.dismissChangeover}
            />
          ) : t.engine.matchOver ? (
            <MatchOverBlock
              sessionType={t.sessionType}
              selfName={t.header.selfName || 'You'}
              oppName={t.header.oppName || 'Opponent'}
              winner={t.engine.matchWinner}
              header={t.header}
              points={t.points}
              sets={t.engine.sets}
              matchStartTime={t.matchStartTime}
              matchEndTime={t.engine.matchOver ? Date.now() : null}
              advisorHistory={advisorHistory}
              onUndo={t.undoLast}
              canUndo={t.points.length > 0}
              onGoStats={() => setActiveTab('stats')}
              onGoClose={() => setActiveTab('close')}
            />
          ) : (
            <>
              {!t.serverExplicitlyChosen && (
                <LiveTrackBar
                  selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
                  nextServer={t.nextServer} setServerChoice={t.setServerChoice}
                  serverExplicitlyChosen={t.serverExplicitlyChosen}
                  hasPoints={t.points.length > 0}
                />
              )}
              {t.serverExplicitlyChosen ? (
                <LiveMatchCommandCenter
                  engine={t.engine}
                  points={t.points}
                  header={t.header}
                  sessionType={t.sessionType}
                  formatPreset={t.formatPreset}
                  pointTarget={t.pointTarget}
                  matchStartTime={t.matchStartTime}
                  nextServer={t.nextServer}
                  onUndo={t.undoLast}
                  onAdvisorTip={handleAdvisorTip}
                  distractionFree={distractionFree}
                  onToggleDistractionFree={() => setDistractionFree(v => !v)}
                  pointRestSecsLeft={timing.pointRestSecsLeft}
                  changeoverActive={timing.changeoverActive}
                  changeoverSecsLeft={timing.changeoverSecsLeft}
                  onDismissChangeover={timing.dismissChangeover}
                >
                  {t.trackingMode === 'quick' ? (
                    <QuickMode
                      nextServer={t.nextServer}
                      onCommit={handleCommitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
                      selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
                      onStopMatch={handleStopMatch}
                      onPointEntryStart={timing.onPointEntryStart}
                    />
                  ) : (
                    <Wizard
                      nextServer={t.nextServer}
                      onCommit={handleCommitPoint} onUndo={t.undoLast} canUndo={t.points.length > 0}
                      selfName={t.header.selfName || 'You'} oppName={t.header.oppName || 'Opponent'}
                      trackingMode={t.trackingMode}
                      onPointEntryStart={timing.onPointEntryStart}
                    />
                  )}
                </LiveMatchCommandCenter>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">Select who serves first above to begin tracking</div>
              )}
            </>
          )}
        </div>

        {/* ── Stats pane ── */}
        <div className={cn(
          'w-full flex-1 space-y-4 overflow-y-auto px-4 pb-6 lg:min-h-0 lg:px-0 lg:pb-0',
          activeTab === 'stats' ? 'mx-auto max-w-3xl block' : 'hidden lg:block'
        )}>
          <MomentumGraph
            points={t.points}
            selfName={t.header.selfName || 'Self'}
            oppName={t.header.oppName || 'Opponent'}
            analytics={t.analytics}
          />
          <StatsPanel
            points={t.points} header={t.header} sessionType={t.sessionType} analytics={t.analytics}
            section="main"
          />
          <PointLog points={t.points} header={t.header} />
          <StatsPanel
            points={t.points} header={t.header} sessionType={t.sessionType} analytics={t.analytics}
            section="shots"
          />
          <ShotLocationHeatmap points={t.points} selfName={t.header.selfName || 'Self'} oppName={t.header.oppName || 'Opponent'} />
        </div>

        </div>
      )}

      {/* ── Close Match tab ── */}
      {activeTab === 'close' && t.matchStarted && (
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          <ActionButtons
            header={t.header} updateHeader={t.updateHeader}
            sessionType={t.sessionType} formatPreset={t.formatPreset} formatLabel={t.formatLabel}
            pointTarget={t.pointTarget} trackingMode={t.trackingMode} points={t.points} engine={t.engine} analytics={t.analytics}
            matchStartTime={t.matchStartTime} matchDurationMs={t.matchDurationMs}
            showStatus={t.showStatus} resetMatch={handleResetMatch}
            subjectPlayerId={t.trackingForPlayerId}
            liveSessionId={liveSessionId}
            onLiveSessionEnded={() => setLiveSessionId(null)}
          />
        </div>
      )}

      {aiReview && (
        <AiReviewModal
          scope={aiReview.scope}
          points={t.points}
          header={t.header}
          onClose={() => setAiReview(null)}
        />
      )}
    </div>
    </AppNav>
  );
}

// ── Small shared field/label helpers ──────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div className="mb-2 font-mono text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function Field({ label, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── Match tab when a match IS running ────────────────────────────────────────
function MatchRunningView({ t, onGoTrack }) {
  // Compose a stable session_id per running match so the advisor keeps a
  // sensible chat memory across multiple tips. Only the fields we actually
  // have from t.header are forwarded — anything else stays null and the
  // backend will fall back to a generic "give me the next-point plan" prompt.
  const advisorContext = {
    session_id: `${t.header.selfName || 'me'}-${t.header.oppName || 'opp'}-${t.header.startedAt || Date.now()}`,
    my_name: t.header.selfName,
    opponent_name: t.header.oppName,
    my_strengths: [t.header.playingStyle].filter(Boolean),
    opponent_notes: t.header.opponentNotes || null,
  };

  return (
    <Card className="mx-auto my-4 max-w-lg">
      <CardContent className="space-y-4 pt-4">
        <div>
          <div className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-ink">Match in Progress</div>
          <div className="mb-3 text-sm">
            <span className="font-semibold text-accent-ink">{t.header.selfName || 'You'}</span>
            {' vs '}
            <span className="font-semibold text-destructive">{t.header.oppName || 'Opponent'}</span>
            {t.header.tournament ? <span className="text-muted-foreground"> · {t.header.tournament}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {t.header.round && (
              <Field label="Round"><div className="py-1 font-mono text-xs text-foreground">{t.header.round}</div></Field>
            )}
            {t.header.surface && (
              <Field label="Surface"><div className="py-1 font-mono text-xs text-foreground">{t.header.surface}</div></Field>
            )}
            {t.header.indoorOutdoor && (
              <Field label="Indoor / Outdoor"><div className="py-1 font-mono text-xs text-foreground">{t.header.indoorOutdoor}</div></Field>
            )}
            {t.header.governingBody && (
              <Field label="Governing Body"><div className="py-1 font-mono text-xs text-foreground">{t.header.governingBody}</div></Field>
            )}
            {t.header.circuit && (
              <Field label="Circuit"><div className="py-1 font-mono text-xs text-foreground">{t.header.circuit}</div></Field>
            )}
            {t.header.city && (
              <Field label="City"><div className="py-1 font-mono text-xs text-foreground">{t.header.city}</div></Field>
            )}
            {t.header.ageGroup && (
              <Field label="Age Group"><div className="py-1 font-mono text-xs text-foreground">{t.header.ageGroup}</div></Field>
            )}
            {t.header.playingStyle && (
              <Field label="Opponent Style"><div className="py-1 font-mono text-xs text-foreground">{t.header.playingStyle}</div></Field>
            )}
            {t.header.rankSeed && (
              <Field label="Opponent Rank/Seed"><div className="py-1 font-mono text-xs text-foreground">{t.header.rankSeed}</div></Field>
            )}
          </div>
        </div>
        <LiveMatchAdvisor matchContext={advisorContext} />
        <Button className="w-full" size="lg" onClick={onGoTrack}>● Go to Track</Button>
      </CardContent>
    </Card>
  );
}

// ── New match form (shown when no match is running) ───────────────────────────
function SetupForm({ t, onStart }) {
  const selfName = t.header.selfName || '';
  const hasName = selfName.trim().length > 0;
  const hasTrackingMode = !!t.trackingMode;
  const canStart = hasName && hasTrackingMode;
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimer = useRef(null);

  async function handleGetWeather() {
    setWeatherLoading(true);
    try {
      const w = await getWeatherString();
      t.updateHeader({ weather: w });
      t.showStatus('Weather updated');
    } catch (e) {
      t.showStatus(e.message);
    } finally {
      setWeatherLoading(false);
    }
  }

  function handleResetClick() {
    if (confirmingReset) {
      t.resetSetupForm();
      setConfirmingReset(false);
      clearTimeout(resetTimer.current);
      t.showStatus('Form reset');
    } else {
      setConfirmingReset(true);
      resetTimer.current = setTimeout(() => setConfirmingReset(false), 3000);
    }
  }

  return (
    <Card className="mx-auto my-4 max-w-lg">
      <CardContent className="space-y-6 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tighter text-foreground">Match Tracker Pro</h1>
            <p className="mt-1 text-xs text-muted-foreground">Enter details below to begin tracking</p>
          </div>
          <Button
            type="button"
            variant={confirmingReset ? 'destructive-solid' : 'ghost'}
            size="sm"
            className="whitespace-nowrap"
            onClick={handleResetClick}
          >
            {confirmingReset ? 'Tap again to confirm' : 'Reset form'}
          </Button>
        </div>

        {/* Players */}
        <section>
          <SectionLabel>Players</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your name *">
              <Input
                placeholder="Your name"
                value={t.header.selfName}
                onChange={(e) => t.updateHeader({ selfName: e.target.value })}
                autoFocus
                data-testid="setup-self-name"
              />
            </Field>
            <Field label="Opponent">
              <Input
                placeholder="Opponent name"
                value={t.header.oppName}
                onChange={(e) => t.updateHeader({ oppName: e.target.value })}
                data-testid="setup-opp-name"
              />
            </Field>
          </div>
        </section>

        {/* Match details — Governing Body / Circuit / City first, since picking
            those (for AITA) drives the tournament auto-suggestions below. */}
        <section>
          <SectionLabel>Match Details</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Governing Body">
              <Select
                value={t.header.governingBody}
                onChange={(e) => t.updateHeader({ governingBody: e.target.value, circuit: '' })}
              >
                <option value="">Not specified</option>
                {GOVERNING_BODY_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Circuit">
              <Select
                value={t.header.circuit}
                disabled={!t.header.governingBody}
                onChange={(e) => t.updateHeader({ circuit: e.target.value })}
                data-testid="setup-circuit"
              >
                <option value="">{t.header.governingBody ? 'Not specified' : 'Select governing body first'}</option>
                {(GOVERNING_BODIES[t.header.governingBody] || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="City">
              <Input
                placeholder="e.g. Pune"
                value={t.header.city}
                onChange={(e) => t.updateHeader({ city: e.target.value })}
              />
            </Field>
            <Field label="Age Group">
              <Select value={t.header.ageGroup} onChange={(e) => t.updateHeader({ ageGroup: e.target.value })} data-testid="setup-age-group">
                <option value="">Not specified</option>
                {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          </div>

          {t.header.governingBody === 'AITA' && t.header.circuit && (
            <AitaTournamentSuggestions header={t.header} updateHeader={t.updateHeader} />
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Tournament / Location">
              <Input
                placeholder="e.g. Club Championship"
                value={t.header.tournament}
                onChange={(e) => t.updateHeader({ tournament: e.target.value })}
                data-testid="setup-tournament"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={t.header.date}
                onChange={(e) => t.updateHeader({ date: e.target.value })}
                data-testid="setup-date"
              />
            </Field>
            {t.sessionType === 'match' && (
              <Field label="Round">
                <Select value={t.header.round} onChange={(e) => t.updateHeader({ round: e.target.value })} data-testid="setup-round">
                  <option value="">Not specified</option>
                  {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Surface">
              <Select value={t.header.surface} onChange={(e) => t.updateHeader({ surface: e.target.value })}>
                <option value="">Not specified</option>
                {SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Indoor / Outdoor">
              <Select value={t.header.indoorOutdoor} onChange={(e) => t.updateHeader({ indoorOutdoor: e.target.value })}>
                <option value="">Not specified</option>
                <option value="Indoor">Indoor</option>
                <option value="Outdoor">Outdoor</option>
              </Select>
            </Field>
          </div>
        </section>

        {/* Opponent details */}
        <section>
          <SectionLabel>Opponent Details</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Handedness">
              <Select value={t.header.oppHandedness} onChange={(e) => t.updateHeader({ oppHandedness: e.target.value })}>
                <option value="">Not specified</option>
                <option value="Right-Handed">Right-Handed</option>
                <option value="Left-Handed">Left-Handed</option>
              </Select>
            </Field>
            <Field label="Playing Style">
              <Select value={t.header.playingStyle} onChange={(e) => t.updateHeader({ playingStyle: e.target.value })}>
                <option value="">Not specified</option>
                {PLAYING_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Rank / Seed" className="col-span-2">
              <Input
                placeholder="e.g. State Rank 12, Seed 4"
                value={t.header.rankSeed}
                onChange={(e) => t.updateHeader({ rankSeed: e.target.value })}
              />
            </Field>
          </div>
        </section>

        {/* Weather */}
        <section>
          <SectionLabel>Weather</SectionLabel>
          <div className="flex gap-1.5">
            <Input
              className="flex-1"
              placeholder="e.g. 24°C, Sunny, Wind 10 km/h"
              value={t.header.weather}
              onChange={(e) => t.updateHeader({ weather: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              disabled={weatherLoading}
              onClick={handleGetWeather}
            >
              {weatherLoading ? 'Locating…' : 'Get Weather'}
            </Button>
          </div>
        </section>

        {/* Session type */}
        <section>
          <SectionLabel>Session Type</SectionLabel>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={t.sessionType === 'match' ? 'default' : 'outline'} onClick={() => t.setSessionType('match')}>
              Match
            </Button>
            <Button type="button" size="sm" variant={t.sessionType === 'practice' ? 'default' : 'outline'} onClick={() => t.setSessionType('practice')}>
              Practice
            </Button>
          </div>

          {t.sessionType === 'match' && (
            <Field label="Match Format" className="mt-3">
              <Select value={t.formatPreset} onChange={(e) => t.setFormatPreset(e.target.value)}>
                <option value="bo3-full">Best of 3 sets (full 3rd set)</option>
                <option value="bo3-mtb10">Best of 3 sets (Match Tiebreak-10 decider)</option>
                <option value="bo5-full">Best of 5 sets</option>
                <option value="proset8">Pro-set (first to 8 games)</option>
                <option value="shortsets4">Short Sets (best of 3, first to 4 games)</option>
              </Select>
            </Field>
          )}

          {t.sessionType === 'practice' && (
            <Field label="Points Target" className="mt-3">
              <div className="flex gap-2">
                {[10, 15, 21].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={t.pointTarget === n ? 'default' : 'outline'}
                    onClick={() => t.setPointTarget(n)}
                  >
                    {n} pts
                  </Button>
                ))}
              </div>
            </Field>
          )}
        </section>

        {/* Tracking detail */}
        <section>
          <SectionLabel>Tracking Detail</SectionLabel>
          <div className="flex gap-2">
            {TRACKING_MODES.map((m) => (
              <Button
                key={m.value}
                type="button"
                size="sm"
                variant={t.trackingMode === m.value ? 'default' : 'outline'}
                onClick={() => t.setTrackingMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t.trackingMode
              ? TRACKING_MODES.find((m) => m.value === t.trackingMode)?.hint
              : 'Choose how much detail to capture per point.'}
          </p>
        </section>

        {/* CTA */}
        <Button className="w-full" size="lg" disabled={!canStart} onClick={onStart}>
          {t.sessionType === 'practice' ? '▶ Start Practice' : '▶ Start Match'}
        </Button>
        {!canStart && (
          <p className="text-xs text-muted-foreground">
            {!hasName && !hasTrackingMode
              ? 'Enter your name and select a tracking detail level to continue'
              : !hasName
              ? 'Enter your name to continue'
              : 'Select a tracking detail level to continue'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function dedupeByName(rows) {
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.name)) seen.set(r.name, r);
  return [...seen.values()];
}

function mapAitaSurfaceToOurs(raw) {
  if (!raw) return null;
  if (SURFACES.includes(raw)) return raw;
  if (raw === 'Hard') return 'Acrylic (Hard-Court)';
  return null;
}

// ── Suggested AITA tournaments for the chosen Circuit (+ City, if typed), drilling
// down Tournament name → Age Group → a read-only Tournament Facts panel, pulled
// straight from the already-synced fact sheet data. ─────────────────────────────
function AitaTournamentSuggestions({ header, updateHeader }) {
  const [tournaments, setTournaments] = useState(null); // null = loading, [] = no matches
  const [error, setError] = useState('');
  const [selectedName, setSelectedName] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setTournaments(null);
    setError('');
    setSelectedName(null);
    const timer = setTimeout(() => {
      api.listAitaTournaments({ city: (header.city || '').trim() || undefined })
        .then((list) => { if (!cancelled) setTournaments(list); })
        .catch((e) => { if (!cancelled) setError(e.message || 'Could not load AITA tournaments'); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [header.city, header.circuit]);

  const circuitMatches = tournaments ? tournaments.filter((t) => mapAitaGradeToCircuit(t.grade) === header.circuit) : null;
  const rowsForName = selectedName && circuitMatches ? circuitMatches.filter((t) => t.name === selectedName) : [];
  const resolvedRow = selectedName
    ? (rowsForName.length === 1 ? rowsForName[0] : rowsForName.find((r) => r.ageGroup === header.ageGroup) || null)
    : null;

  function pickTournament(row) {
    const patch = { tournament: row.name, ageGroup: row.ageGroup || header.ageGroup };
    if (row.city) patch.city = row.city;
    if (row.startDate) patch.date = row.startDate.slice(0, 10);
    const mappedSurface = mapAitaSurfaceToOurs(row.surface);
    if (mappedSurface) patch.surface = mappedSurface;
    updateHeader(patch);
  }

  function handlePickName(name) {
    setSelectedName(name);
    const rows = circuitMatches.filter((t) => t.name === name);
    if (rows.length === 1) pickTournament(rows[0]);
  }

  return (
    <Card className="mt-3">
      <CardContent className="space-y-2 pt-4">
        <SectionLabel>Suggested AITA Tournaments</SectionLabel>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && tournaments === null && (
          <p className="text-xs text-muted-foreground">Searching the AITA calendar…</p>
        )}
        {!error && circuitMatches && circuitMatches.length === 0 && (
          <p className="text-xs text-muted-foreground">No matching AITA tournaments found{header.city ? ` for "${header.city}"` : ''}.</p>
        )}

        {/* Stage 1 — pick the event (a name can host several age-group draws) */}
        {!error && circuitMatches && circuitMatches.length > 0 && !selectedName && (
          <div className="flex flex-col gap-1.5">
            {dedupeByName(circuitMatches).map((tour) => (
              <button
                key={tour.name}
                type="button"
                onClick={() => handlePickName(tour.name)}
                className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-transparent px-3 py-2 text-left hover:border-primary"
              >
                <span className="text-sm font-semibold text-foreground">{tour.name}</span>
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                  {[[tour.city, tour.venue].filter(Boolean).join(' · '), tour.startDate].filter(Boolean).join('  ·  ')}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Stage 2 — this event has multiple age-group draws, pick one */}
        {selectedName && !resolvedRow && rowsForName.length > 1 && (
          <div className="space-y-2">
            <button type="button" className="bg-transparent text-xs text-muted-foreground underline" onClick={() => setSelectedName(null)}>
              ← Choose a different tournament
            </button>
            <p className="text-xs text-muted-foreground">{selectedName} — which age group?</p>
            <div className="flex flex-wrap gap-1.5">
              {rowsForName.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pickTournament(row)}
                  className="rounded-lg border border-border bg-transparent px-2.5 py-1 text-xs text-foreground hover:border-primary"
                >
                  {row.ageGroup || 'Unspecified'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stage 3 — resolved to one exact tournament row: show its facts */}
        {resolvedRow && (
          <div className="space-y-2">
            <button type="button" className="bg-transparent text-xs text-muted-foreground underline" onClick={() => setSelectedName(null)}>
              ← Choose a different tournament
            </button>
            <TournamentFactsPanel tour={resolvedRow} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}

// ── Read-only facts pulled from the resolved aita_tournaments row ────────────
function TournamentFactsPanel({ tour }) {
  const director = [tour.directorName, tour.directorPhone, tour.directorEmail].filter(Boolean).join(' · ');
  const referee = [tour.refereeName, tour.refereePhone, tour.refereeEmail].filter(Boolean).join(' · ');
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="text-sm font-semibold text-accent-ink">{tour.name} — {tour.ageGroup}</div>
      <div className="grid grid-cols-2 gap-2.5">
        <Fact label="Court Type" value={tour.surface} />
        <Fact label="Draw Size" value={tour.drawSize} />
        <Fact label="Ball Brand" value={tour.ballBrand} />
        <Fact label="Floodlights" value={tour.hasFloodlights == null ? '' : (tour.hasFloodlights ? 'Yes' : 'No')} />
        <Fact label="Entry Fee (Singles)" value={tour.entryFeeSingles ? `₹${tour.entryFeeSingles}` : ''} />
        <Fact label="Entry Fee (Doubles)" value={tour.entryFeeDoubles ? `₹${tour.entryFeeDoubles}` : ''} />
        <Fact label="Daily Allowance" value={tour.dailyAllowance ? `₹${tour.dailyAllowance}` : ''} />
        <Fact label="Entry Deadline" value={tour.entryDeadline} />
        <Fact label="Withdrawal Deadline" value={tour.withdrawalDeadline} />
        <Fact label="Venue" value={[tour.venue, tour.venueAddress].filter(Boolean).join(', ')} />
      </div>
      <Fact label="Sign-in" value={tour.signinInstructions} />
      <Fact label="Tournament Director" value={director} />
      <Fact label="Tournament Referee" value={referee} />
      {tour.factsheetUrl && (
        <a href={tour.factsheetUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent-ink underline">
          View full fact sheet PDF ↗
        </a>
      )}
    </div>
  );
}

// ── Static block shown when match/session is over and wizard must be frozen ──
function MatchOverBlock({ sessionType, selfName, oppName, winner, header, points, sets, matchStartTime, matchEndTime, advisorHistory, onUndo, canUndo, onGoStats, onGoClose }) {
  const isPractice = sessionType === 'practice';
  const winnerName = winner === 'self' ? selfName : oppName;
  return (
    <div className="mx-auto my-4 max-w-lg space-y-4">
      <Card className="text-center">
        <CardContent className="space-y-4 pt-6">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {isPractice ? 'Session complete' : 'Match complete'}
          </div>
          <div className="font-display text-xl font-bold uppercase tracking-tight">
            <span className={winner === 'self' ? 'text-accent-ink' : 'text-destructive'}>{winnerName}</span>
            {isPractice ? ' wins the session' : ' wins'}
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onGoStats}>View Stats</Button>
            {!isPractice && <Button variant="outline" onClick={onGoClose}>Close Match</Button>}
          </div>
          <Button variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo}>↩ Undo last point</Button>
        </CardContent>
      </Card>

      {!isPractice && (
        <HighlightReelCard
          header={header}
          points={points}
          sets={sets}
          winnerName={winnerName}
          isSelfWin={winner === 'self'}
          matchStartTime={matchStartTime}
          matchEndTime={matchEndTime}
          advisorHistory={advisorHistory}
        />
      )}
    </div>
  );
}

// ── Game / Set / Match transition card with per-game stats ───────────────────
function GameTransitionCard({
  transition, selfName, oppName, onContinue, onUndo, canUndo, onReview,
  pointRestSecsLeft, changeoverActive, changeoverSecsLeft, onDismissChangeover,
}) {
  const { type, winner, gamePoints, sets, setGames, nextServer } = transition;
  const winnerName = winner === 'self' ? selfName : oppName;

  const stats = computeStats(gamePoints);
  const ss = computeServeStats(gamePoints, 'self');
  const so = computeServeStats(gamePoints, 'opp');

  let headline, subline, btnLabel;
  if (type === 'match') {
    headline = `${winnerName} wins the match!`;
    subline = sets.map((s) =>
      s.isMatchTiebreak ? `[${s.tb.self}–${s.tb.opp}]` : `${s.self}–${s.opp}`
    ).join('  ');
    btnLabel = 'Continue';
  } else if (type === 'set') {
    const last = sets[sets.length - 1];
    const selfSets = sets.filter((s) => s.self > s.opp).length;
    const oppSets = sets.filter((s) => s.opp > s.self).length;
    headline = `Set ${sets.length} to ${winnerName}`;
    subline = `${last.self}–${last.opp}  ·  Sets: ${selfSets}–${oppSets}`;
    btnLabel = 'Next Set →';
  } else {
    headline = `Game to ${winnerName}`;
    subline = `${selfName} ${setGames.self}–${setGames.opp} ${oppName}`;
    btnLabel = 'Next Game →';
  }

  const hasServeData = ss.totalServicePts > 0 || so.totalServicePts > 0;

  return (
    <Card className="mx-auto my-4 max-w-lg">
      <CardContent className="space-y-4 pt-6">
        <MatchTimingBanners
          pointRestSecsLeft={pointRestSecsLeft}
          changeoverActive={changeoverActive}
          changeoverSecsLeft={changeoverSecsLeft}
          onDismissChangeover={onDismissChangeover}
        />
        <div className="text-center">
          <div className={cn('font-display text-xl font-bold uppercase tracking-tight', winner === 'self' ? 'text-accent-ink' : 'text-destructive')}>
            {headline}
          </div>
          <div className="mt-1 font-mono text-sm text-muted-foreground">{subline}</div>
          {type !== 'match' && nextServer && (
            <div className="mt-2 text-xs text-muted-foreground">
              Serves next:&nbsp;
              <span className={nextServer === 'self' ? 'font-semibold text-accent-ink' : 'font-semibold text-destructive'}>
                {nextServer === 'self' ? selfName : oppName}
              </span>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 font-mono text-[12px] font-bold uppercase tracking-widest text-muted-foreground">This Game</div>
          <Table>
            <TableBody>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-accent-ink">{selfName}</TableHead>
                <TableHead className="text-destructive">{oppName}</TableHead>
              </TableRow>
              <TableRow>
                <TableCell>Points Won</TableCell>
                <TableCell className="text-accent-ink">{stats.self.pointCount}</TableCell>
                <TableCell className="text-destructive">{stats.opp.pointCount}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Winners / FE</TableCell>
                <TableCell className="text-accent-ink">{stats.self.wfe}</TableCell>
                <TableCell className="text-destructive">{stats.opp.wfe}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Unforced Errors</TableCell>
                <TableCell className="text-accent-ink">{stats.self.ue}</TableCell>
                <TableCell className="text-destructive">{stats.opp.ue}</TableCell>
              </TableRow>
              {hasServeData && (
                <>
                  <TableRow>
                    <TableCell>1st Serve %</TableCell>
                    <TableCell className="text-accent-ink">{ss.totalServicePts > 0 ? ss.firstPct.toFixed(0) + '%' : '—'}</TableCell>
                    <TableCell className="text-destructive">{so.totalServicePts > 0 ? so.firstPct.toFixed(0) + '%' : '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Won on 1st</TableCell>
                    <TableCell className="text-accent-ink">{ss.firstIn > 0 ? `${ss.wonOn1st}/${ss.firstIn}` : '—'}</TableCell>
                    <TableCell className="text-destructive">{so.firstIn > 0 ? `${so.wonOn1st}/${so.firstIn}` : '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Won on 2nd</TableCell>
                    <TableCell className="text-accent-ink">{ss.secondIn > 0 ? `${ss.wonOn2nd}/${ss.secondIn}` : '—'}</TableCell>
                    <TableCell className="text-destructive">{so.secondIn > 0 ? `${so.wonOn2nd}/${so.secondIn}` : '—'}</TableCell>
                  </TableRow>
                  {(ss.aces > 0 || so.aces > 0 || ss.dfs > 0 || so.dfs > 0) && (
                    <TableRow>
                      <TableCell>Aces / DFs</TableCell>
                      <TableCell className="text-accent-ink">{ss.aces} / {ss.dfs}</TableCell>
                      <TableCell className="text-destructive">{so.aces} / {so.dfs}</TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo}>↩ Undo</Button>
          {onReview && <Button variant="outline" size="sm" onClick={onReview}>🤖 Review with AI</Button>}
          <Button size="lg" onClick={onContinue}>{btnLabel}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live Track top bar: server picker + delete ────────────────────────────────
function LiveTrackBar({ selfName, oppName, nextServer, setServerChoice, serverExplicitlyChosen, hasPoints }) {
  return (
    <Card className={cn('my-4', !serverExplicitlyChosen && 'border-primary')}>
      <CardContent className="flex flex-col items-center gap-3 pt-4 sm:flex-row">
        <span className={cn('font-mono text-xs uppercase tracking-widest', !serverExplicitlyChosen ? 'font-bold text-accent-ink' : 'text-muted-foreground')}>
          Serves first
        </span>
        <div className="flex flex-1 gap-2">
          <Button
            type="button"
            className="flex-1"
            variant={nextServer === 'self' ? 'default' : 'outline'}
            disabled={hasPoints}
            onClick={() => !hasPoints && setServerChoice('self')}
            data-testid="serve-first-self-btn"
          >
            {selfName}
          </Button>
          <Button
            type="button"
            className="flex-1"
            variant={nextServer === 'opp' ? 'default' : 'outline'}
            disabled={hasPoints}
            onClick={() => !hasPoints && setServerChoice('opp')}
            data-testid="serve-first-opp-btn"
          >
            {oppName}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
